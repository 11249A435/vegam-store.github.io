from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import hashlib
import secrets
import json
from pathlib import Path
import uvicorn

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load product data from JSON file
product_file = Path(__file__).parent / "product.json"
with open(product_file, "r") as f:
    product = json.load(f)

users = {}
sessions = {}
cart = []
wishlist = []
orders = []
reviews = {}


def get_cart_store(user):
    return user["cart"] if user else cart


def get_wishlist_store(user):
    return user["wishlist"] if user else wishlist


def find_cart_item(cart_items, product_id):
    return next((item for item in cart_items if item["product_id"] == product_id), None)


class RegisterModel(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None
    address: Optional[str] = None

class LoginModel(BaseModel):
    email: str
    password: str


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


def generate_token() -> str:
    return secrets.token_hex(16)


def get_user_by_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        return None
    if authorization.startswith("Bearer "):
        authorization = authorization[7:]
    email = sessions.get(authorization)
    if not email:
        return None
    return users.get(email)


def get_review_stats(product_id: int):
    product_reviews = reviews.get(product_id, [])
    if not product_reviews:
        return 0.0, 0
    avg = sum(r["rating"] for r in product_reviews) / len(product_reviews)
    return round(avg, 1), len(product_reviews)

@app.get("/")
def home():
    return {"message": "Vegam backend is running!"}

@app.post("/register")
def register(data: RegisterModel):
    if data.email in users:
        raise HTTPException(status_code=400, detail="Email already registered")
    users[data.email] = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone or "",
        "address": data.address or "",
        "password": hash_password(data.password),
        "cart": [],
        "wishlist": [],
        "orders": [],
    }
    return {"message": "Registered successfully"}

@app.post("/login")
def login(data: LoginModel):
    user = users.get(data.email)
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = generate_token()
    sessions[token] = data.email
    return {
        "token": token,
        "name": user["name"],
        "email": user["email"],
        "phone": user.get("phone", ""),
        "address": user.get("address", ""),
    }

@app.get("/me")
def me(authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {
        "name": user["name"],
        "email": user["email"],
        "phone": user.get("phone", ""),
        "address": user.get("address", ""),
    }

@app.get("/product")
def get_products():
    enriched = []
    for item in product:
        avg_rating, review_count = get_review_stats(item["id"])
        enriched.append(dict(item, avg_rating=avg_rating, review_count=review_count))
    return enriched

@app.get("/product/{product_id}/details")
def get_product_details(product_id: int, authorization: Optional[str] = Header(None)):
    product_item = next((item for item in product if item["id"] == product_id), None)
    if not product_item:
        raise HTTPException(status_code=404, detail="Product not found")
    avg_rating, review_count = get_review_stats(product_id)
    product_reviews = reviews.get(product_id, [])
    recommendations = []
    for item in product:
        if item["category"] == product_item["category"] and item["id"] != product_id:
            rec_avg, rec_count = get_review_stats(item["id"])
            recommendations.append(dict(item, avg_rating=rec_avg, review_count=rec_count))
        if len(recommendations) >= 4:
            break
    response = dict(
        product_item,
        avg_rating=avg_rating,
        review_count=review_count,
        reviews=product_reviews,
        recommendations=recommendations,
    )
    user = get_user_by_token(authorization)
    if user:
        response["in_cart"] = any(item["product_id"] == product_id for item in user["cart"])
        response["in_wishlist"] = product_id in user["wishlist"]
    else:
        response["in_cart"] = False
        response["in_wishlist"] = product_id in wishlist
    return response

@app.get("/product/{product_id}")
def get_product_by_id(product_id: int):
    for item in product:
        if item["id"] == product_id:
            avg_rating, review_count = get_review_stats(product_id)
            return dict(item, avg_rating=avg_rating, review_count=review_count)
    return {"error": "Product not found"}

@app.post("/cart/{product_id}")
def add_to_cart(product_id: int, quantity: int = 1, authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if quantity <= 0:
        return remove_from_cart(product_id, authorization)
    cart_items = user["cart"]
    item = find_cart_item(cart_items, product_id)
    if item:
        item["quantity"] += quantity
    else:
        cart_items.append({"product_id": product_id, "quantity": quantity})
    return {"message": f"Product {product_id} added to cart", "cart": cart_items}

@app.put("/cart/{product_id}")
def update_cart_quantity(product_id: int, quantity: int, authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    cart_items = user["cart"]
    item = find_cart_item(cart_items, product_id)
    if not item:
        raise HTTPException(status_code=404, detail="Product not in cart")
    if quantity <= 0:
        return remove_from_cart(product_id, authorization)
    item["quantity"] = quantity
    return {"message": f"Cart updated for product {product_id}", "cart": cart_items}

@app.delete("/cart/{product_id}")
def remove_from_cart(product_id: int, authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    cart_items = user["cart"]
    cart_items[:] = [item for item in cart_items if item["product_id"] != product_id]
    return {"message": f"Product {product_id} removed from cart", "cart": cart_items}

@app.get("/cart")
def view_cart(authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"cart": user["cart"]}

@app.post("/wishlist/{product_id}")
def add_to_wishlist(product_id: int, authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if user:
        user["wishlist"].append(product_id)
        return {"message": f"Product {product_id} added to wishlist", "wishlist": user["wishlist"]}
    wishlist.append(product_id)
    return {"message": f"Product {product_id} added to wishlist", "wishlist": wishlist}

@app.get("/wishlist")
def view_wishlist(authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if user:
        return {"wishlist": user["wishlist"]}
    return {"wishlist": wishlist}

@app.post("/checkout")
def checkout(payment_method: str = "Cash on Delivery", authorization: Optional[str] = Header(None)):
    allowed_methods = [
        "Cash on Delivery",
        "PhonePe",
        "Paytm",
        "GooglePay",
        "UPI",
        "Debit Card",
        "Credit Card",
        "Netbanking",
        "Wallet",
    ]
    if payment_method not in allowed_methods:
        payment_method = "Cash on Delivery"
    user = get_user_by_token(authorization)
    if user:
        order = {"items": [item.copy() for item in user["cart"]], "payment": payment_method, "status": "Processing"}
        user["orders"].append(order)
        user["cart"].clear()
    else:
        order = {"items": [item.copy() for item in cart], "payment": payment_method, "status": "Processing"}
        orders.append(order)
        cart.clear()
    return {"message": "Order placed", "order": order}

@app.get("/orders")
def view_orders(authorization: Optional[str] = Header(None)):
    user = get_user_by_token(authorization)
    if user:
        return {"orders": user["orders"]}
    return {"orders": orders}

@app.post("/forgot-password")
def forgot_password(email: str):
    if email not in users:
        raise HTTPException(status_code=404, detail="Email not registered")
    return {"message": "Password reset link sent to your email (simulated)."}


@app.post("/reviews/{product_id}")
def add_review(product_id: int, rating: int, comment: str):
    if product_id not in reviews:
        reviews[product_id] = []
    reviews[product_id].append({"rating": rating, "comment": comment})
    return {"message": "Review added", "reviews": reviews[product_id]}

@app.get("/reviews/{product_id}")
def get_reviews(product_id: int):
    return reviews.get(product_id, [])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001, reload=True)
