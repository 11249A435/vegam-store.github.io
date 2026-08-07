const API_BASE = "http://localhost:8000";
let productsData = [];
let currentUser = null;

function showSection(section) {
  document.querySelectorAll("main section").forEach(sec => sec.style.display = "none");

  if (section === "cart" && !currentUser) {
    showSection("login");
    return;
  }

  const target = document.getElementById(section);
  if (target) target.style.display = "block";

  if (section === "cart") {
    loadCart();
  } else if (section === "wishlist") {
    loadWishlist();
  } else if (section === "orders") {
    loadOrders();
  }

  document.querySelectorAll("#main-nav .menu-item").forEach(btn => {
    const btnSection = btn.dataset.section || btn.id.replace(/-button$/, "");
    btn.classList.toggle("active", btnSection === section);
  });
}

function navigateMenu(section) {
  const nav = document.getElementById("main-nav");
  if (nav.classList.contains("menu-open")) {
    nav.classList.remove("menu-open");
    nav.classList.add("menu-closed");
  }
  showSection(section);
}

function toggleMenu() {
  const nav = document.getElementById("main-nav");
  const button = document.getElementById("menu-toggle");
  if (!nav || !button) return;

  const isOpen = nav.classList.contains("menu-open");
  if (isOpen) {
    nav.classList.remove("menu-open");
    nav.classList.add("menu-closed");
    button.classList.remove("open");
    nav.style.left = "";
    nav.style.top = "";
    nav.style.right = "";
    try { button.setAttribute('aria-expanded', 'false'); } catch(e){}
    // keep checkbox in sync when closing
    try { const menuCheckbox = document.getElementById('menu-toggle-checkbox'); if (menuCheckbox) menuCheckbox.checked = false; } catch(e){}
  } else {
    // compute coordinates so nav aligns to the right edge of the toggle
    const header = document.querySelector('.app-header');
    const headerRect = header ? header.getBoundingClientRect() : { left: 0, top: 0 };
    const btnRect = button.getBoundingClientRect();

    // ensure nav is visible to measure
    nav.classList.add('menu-open');
    nav.classList.remove('menu-closed');

    // clear right to allow left positioning to take effect
    nav.style.right = 'auto';

    console.debug('[toggleMenu] btnRect:', btnRect, 'navRect(before):', nav.getBoundingClientRect());

    // measure nav width and constrain it to the viewport first
    let navRect = nav.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const maxAllowedWidth = Math.max(0, viewportWidth - 16); // keep small gutter
    const desiredWidth = Math.min(navRect.width, maxAllowedWidth);
    nav.style.width = desiredWidth + 'px';

    // re-measure after applying width so positioning uses the final size
    navRect = nav.getBoundingClientRect();
    // position nav so its right aligns with button's right (use viewport coords)
    const left = btnRect.right - navRect.width;
    const top = btnRect.bottom + 8; // small offset below button (viewport coords)
    // clamp left to viewport so the dropdown doesn't go under the scrollbar
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, viewportWidth - navRect.width - 8);
    const clampedLeft = Math.min(Math.max(minLeft, left), maxLeft);

    // If clamped to the maximum (near the right edge), anchor from the right
    if (clampedLeft >= maxLeft - 1) {
      nav.style.left = '';
      nav.style.right = '8px';
    } else {
      nav.style.right = 'auto';
      nav.style.left = clampedLeft + 'px';
    }
    nav.style.top = top + 'px';
    button.classList.add('open');
    try { button.setAttribute('aria-expanded', 'true'); } catch(e){}
    // keep checkbox in sync when opening
    try { const menuCheckbox = document.getElementById('menu-toggle-checkbox'); if (menuCheckbox) menuCheckbox.checked = true; } catch(e){}
    console.debug('[toggleMenu] positioned nav at', nav.style.left, nav.style.top, 'navRect(after):', nav.getBoundingClientRect());
  }
}

async function login(event) {
  event.preventDefault();
  clearFormMessages();
  const email = document.getElementById("login-email")?.value.trim();
  const password = document.getElementById("login-password")?.value;

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showFormMessage("login-message", error.detail || "Login failed", "error");
      return;
    }

    const data = await response.json();
    setToken(data.token);
    currentUser = { name: data.name, email: data.email, phone: data.phone || "", address: data.address || "" };
    updateUserArea();
    showSection("home");
    loadProducts();
  } catch (err) {
    console.error('login error', err);
    showFormMessage("login-message", "Unable to reach the backend. Please start the server and try again.", "error");
  }
}

function searchFocus() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.focus();
    searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function getToken() {
  return localStorage.getItem("vegam_token");
}

function setToken(token) {
  if (token) {
    localStorage.setItem("vegam_token", token);
  } else {
    localStorage.removeItem("vegam_token");
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetch(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    ...authHeaders(),
  };
  return fetch(url, options);
}

async function loadUser() {
  const token = getToken();
  if (!token) {
    currentUser = null;
    updateUserArea();
    return;
  }

  const response = await authFetch(`${API_BASE}/me`);
  if (response.ok) {
    currentUser = await response.json();
  } else {
    currentUser = null;
    setToken(null);
  }
  updateUserArea();
}

function updateUserArea() {
  const userDisplay = document.getElementById("user-display");
  const loginLink = document.getElementById("login-link");
  const registerLink = document.getElementById("register-link");
  const logoutLink = document.getElementById("logout-link");

  if (currentUser) {
    if (userDisplay) userDisplay.textContent = `Hello, ${currentUser.name}`;
    if (loginLink) loginLink.style.display = "none";
    if (registerLink) registerLink.style.display = "none";
    if (logoutLink) logoutLink.style.display = "inline-block";
  } else {
    if (userDisplay) userDisplay.textContent = "Guest";
    if (loginLink) loginLink.style.display = "inline-block";
    if (registerLink) registerLink.style.display = "inline-block";
    if (logoutLink) logoutLink.style.display = "none";
  }
  updateHeaderMenu();
  updateProfileDisplay();
}

function updateHeaderMenu() {
  const authButton = document.getElementById("auth-action-button");
  if (!authButton) return;
  authButton.textContent = currentUser ? "logout" : "login";
}

function updateProfileDisplay() {
  if (!currentUser) return;
  const profileName = document.getElementById("profile-name");
  const profileEmail = document.getElementById("profile-email");
  const profilePhone = document.getElementById("profile-phone");
  const profileAddress = document.getElementById("profile-address");
  if (profileName) profileName.textContent = currentUser.name || "-";
  if (profileEmail) profileEmail.textContent = currentUser.email || "-";
  if (profilePhone) profilePhone.textContent = currentUser.phone || "-";
  if (profileAddress) profileAddress.textContent = currentUser.address || "-";
}

function closeMenu() {
  const nav = document.getElementById("main-nav");
  const button = document.getElementById("menu-toggle");
  const menuCheckbox = document.getElementById('menu-toggle-checkbox');
  if (!nav) return;
  nav.classList.remove("menu-open");
  nav.classList.add("menu-closed");
  if (button) button.classList.remove("open");
  if (button) button.setAttribute('aria-expanded', 'false');
  if (menuCheckbox) menuCheckbox.checked = false;
}

function authAction() {
  if (currentUser) {
    logout();
    closeMenu();
  } else {
    showSection("login");
    closeMenu();
  }
}

function showNotifications() {
  closeMenu();
  alert("No new notifications yet.");
}

function showFormMessage(id, text, type = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `form-message ${type}`;
}

function clearFormMessages() {
  ["login-message", "register-message", "forgot-message"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "";
      el.className = "form-message";
    }
  });
}



async function registerUser(event) {
  event.preventDefault();
  clearFormMessages();
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const phone = document.getElementById("register-phone").value.trim();
  const address = document.getElementById("register-address").value.trim();
  const password = document.getElementById("register-password").value;

  const response = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone, address, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    showFormMessage("register-message", error.detail || "Registration failed", "error");
    return;
  }

  showFormMessage("register-message", "Registration successful. Please login.", "success");
  showSection("login");
}

async function forgotPassword(event) {
  event.preventDefault();
  clearFormMessages();
  const email = document.getElementById("forgot-email").value.trim();
  if (!email) {
    showFormMessage("forgot-message", "Please enter your email.", "error");
    return;
  }

  const response = await fetch(`${API_BASE}/forgot-password?email=${encodeURIComponent(email)}`, {
    method: "POST",
  });

  const data = await response.json();
  if (!response.ok) {
    showFormMessage("forgot-message", data.detail || "Unable to process reset request.", "error");
    return;
  }

  showFormMessage("forgot-message", data.message, "success");
  setTimeout(() => showSection("login"), 1200);
}

function logout() {
  setToken(null);
  currentUser = null;
  updateUserArea();
  showSection("home");
}

async function loadProducts() {
  const response = await fetch(`${API_BASE}/product`);
  productsData = await response.json();
  renderProducts(productsData);
}

function renderStars(rating) {
  const full = Math.round(rating || 0);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

function renderProducts(items) {
  const container = document.getElementById("product-container");
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = "<p>No products found.</p>";
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${item.image}" alt="${item.name}" onerror="this.onerror=null;this.src='https://via.placeholder.com/400x300?text=No+Image'" onclick="viewProduct(${item.id})" />
      <div class="info">
        <h3 onclick="viewProduct(${item.id})">${item.name}</h3>
        <p class="rating">${renderStars(item.avg_rating)} <span>(${item.review_count} reviews)</span></p>
        <p>Category: ${item.category}</p>
        <p class="price">₹${item.price}</p>
        <div class="actions">
          <button onclick="addToCart(${item.id})">Add to Cart</button>
          <button onclick="addToWishlist(${item.id})">Wishlist</button>
          <button onclick="viewProduct(${item.id})">View Details</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function getSearchQuery() {
  return document.getElementById("search-input").value.trim().toLowerCase();
}

function getSelectedCategory() {
  return document.getElementById("category").value;
}

function searchProducts() {
  const query = getSearchQuery();
  const category = getSelectedCategory();

  const filtered = productsData.filter(item => {
    const matchesQuery = query === "" ||
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query);
    const matchesCategory = category === "all" || item.category === category;
    return matchesQuery && matchesCategory;
  });

  renderProducts(filtered);
}

function findProductById(id) {
  return productsData.find(item => item.id === id);
}

function renderList(items, containerId, emptyMessage) {
  const container = document.getElementById(containerId);
  if (!items.length) {
    container.innerHTML = `<p>${emptyMessage}</p>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const product = findProductById(item) || { name: `Product ${item}`, price: "N/A" };
    return `<div class="list-item"><strong>${product.name}</strong> - ₹${product.price}</div>`;
  }).join("");
}

function updateCartSummary(items) {
  const summary = document.getElementById("cart-summary");
  const total = items.reduce((sum, item) => {
    const product = findProductById(item.product_id);
    return sum + (product && typeof product.price === "number" ? product.price * item.quantity : 0);
  }, 0);
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  if (!summary) return;
  summary.innerHTML = `
    <div class="cart-summary-item"><strong>Items:</strong> ${totalCount}</div>
    <div class="cart-summary-item"><strong>Total:</strong> ₹${total}</div>
    <div class="cart-payment">
      <label for="payment-method">Payment:</label>
      <select id="payment-method">
        <option value="Cash on Delivery">Cash on Delivery</option>
        <option value="PhonePe">PhonePe</option>
        <option value="Paytm">Paytm</option>
        <option value="GooglePay">GooglePay</option>
        <option value="UPI">UPI</option>
        <option value="Debit Card">Debit Card</option>
        <option value="Credit Card">Credit Card</option>
        <option value="Netbanking">Netbanking</option>
      </select>
    </div>
  `;
}

function renderCart(items) {
  const container = document.getElementById("cart-container");
  if (!items.length) {
    container.innerHTML = "<p>Your cart is empty.</p>";
    updateCartSummary([]);
    return;
  }

  container.innerHTML = items.map(item => {
    const product = findProductById(item.product_id) || { name: `Product ${item.product_id}`, price: 0 };
    const price = typeof product.price === "number" ? product.price : 0;
    const subtotal = price * item.quantity;
    return `
      <div class="cart-item">
        <div class="cart-item-left">
          <strong>${product.name}</strong>
          <div>Price: ₹${price}</div>
          <div>Quantity: ${item.quantity}</div>
          <div>Subtotal: ₹${subtotal}</div>
        </div>
        <div class="cart-item-right">
          <div class="qty-control">
            <button onclick="updateCartQuantity(${item.product_id}, ${item.quantity - 1})">-</button>
            <span>${item.quantity}</span>
            <button onclick="updateCartQuantity(${item.product_id}, ${item.quantity + 1})">+</button>
          </div>
          <button class="remove-button" onclick="removeCartItem(${item.product_id})">Remove</button>
        </div>
      </div>
    `;
  }).join("");
  updateCartSummary(items);
}

async function addToCart(id) {
  if (!currentUser) {
    alert("Please login to add items to cart.");
    showSection("login");
    return;
  }
  await authFetch(`${API_BASE}/cart/${id}`, { method: "POST" });
  alert("Added to cart!");
  loadCart();
}

async function loadCart() {
  if (!currentUser) {
    showSection("login");
    return;
  }
  const response = await authFetch(`${API_BASE}/cart`);
  if (response.status === 401) {
    showSection("login");
    return;
  }
  const data = await response.json();
  renderCart(data.cart);
}

async function addToWishlist(id) {
  await authFetch(`${API_BASE}/wishlist/${id}`, { method: "POST" });
  alert("Added to wishlist!");
  loadWishlist();
}

async function loadWishlist() {
  const response = await authFetch(`${API_BASE}/wishlist`);
  const data = await response.json();
  renderList(data.wishlist, "wishlist-container", "Your wishlist is empty.");
}

async function updateCartQuantity(id, quantity) {
  if (quantity <= 0) {
    return removeCartItem(id);
  }
  await authFetch(`${API_BASE}/cart/${id}?quantity=${quantity}`, { method: "PUT" });
  loadCart();
}

async function removeCartItem(id) {
  await authFetch(`${API_BASE}/cart/${id}`, { method: "DELETE" });
  loadCart();
}

async function checkout() {
  const paymentMethod = document.getElementById("payment-method")?.value || "Cash on Delivery";
  const response = await authFetch(`${API_BASE}/checkout?payment_method=${encodeURIComponent(paymentMethod)}`, { method: "POST" });
  const data = await response.json();
  alert("Order placed with payment: " + data.order.payment);
  loadCart();
  loadOrders();
}

async function loadOrders() {
  const response = await authFetch(`${API_BASE}/orders`);
  const data = await response.json();
  const container = document.getElementById("orders-container");

  if (!data.orders || !data.orders.length) {
    container.innerHTML = "<p>No orders placed yet.</p>";
    return;
  }

  container.innerHTML = data.orders.map((order, index) => {
    const details = order.items.map(item => {
      const productId = item.product_id ?? item;
      const quantity = item.quantity ?? 1;
      const product = findProductById(productId);
      const name = product ? product.name : `Product ${productId}`;
      return `${name} x${quantity}`;
    }).join(", ");
    return `<div class="order-item"><strong>Order ${index + 1}</strong><div>Items: ${details || "None"}</div><div>Payment: ${order.payment}</div><div>Status: ${order.status}</div></div>`;
  }).join("");
}

async function viewProduct(id) {
  const response = await authFetch(`${API_BASE}/product/${id}/details`);
  if (!response.ok) {
    const error = await response.json();
    alert(error.detail || "Unable to load product details");
    return;
  }
  const product = await response.json();
  renderProductDetail(product);
  showSection("product-detail");
}

function renderProductDetail(product) {
  const container = document.getElementById("detail-container");
  container.innerHTML = `
    <div class="detail-main">
      <div class="detail-image">
        <img src="${product.image}" alt="${product.name}" onerror="this.onerror=null;this.src='https://via.placeholder.com/600x450?text=No+Image'" />
      </div>
      <div class="detail-info">
        <h2>${product.name}</h2>
        <p class="rating">${renderStars(product.avg_rating)} <span>(${product.review_count} reviews)</span></p>
        <p class="price">Price: ₹${product.price}</p>
        <p class="detail-category">Category: ${product.category}</p>
        <p class="detail-description">${product.description}</p>
        <div class="detail-actions">
          <button onclick="addToCart(${product.id})">Add to Cart</button>
          <button onclick="addToWishlist(${product.id})">Add to Wishlist</button>
          <button onclick="addReview(${product.id})">Add Review</button>
        </div>
      </div>
    </div>
    <div class="detail-reviews">
      <h3>Reviews</h3>
      ${renderReviewList(product.reviews)}
    </div>
    <div class="detail-recommendations">
      <h3>Recommended for you</h3>
      <div class="recommendation-grid">
        ${renderRecommendations(product.recommendations)}
      </div>
    </div>
  `;
}

function renderReviewList(reviews) {
  if (!reviews || !reviews.length) {
    return "<p>No reviews yet. Be the first to review this product.</p>";
  }

  return reviews.map(review => `
    <div class="review-item">
      <div class="review-stars">${renderStars(review.rating)}</div>
      <div class="review-comment">${review.comment}</div>
    </div>
  `).join("");
}

function renderRecommendations(items) {
  if (!items || !items.length) {
    return "<p>No similar products found.</p>";
  }

  return items.map(item => `
    <div class="recommendation-card" onclick="viewProduct(${item.id})">
      <img src="${item.image}" alt="${item.name}" onerror="this.onerror=null;this.src='https://via.placeholder.com/300x220?text=No+Image'" />
      <div class="recommendation-info">
        <h4>${item.name}</h4>
        <p class="rating">${renderStars(item.avg_rating)} <span>(${item.review_count})</span></p>
        <p class="price">₹${item.price}</p>
      </div>
    </div>
  `).join("");
}

async function viewReviews(id) {
  const response = await authFetch(`${API_BASE}/reviews/${id}`);
  const reviews = await response.json();
  if (!reviews.length) {
    alert("No reviews yet for this product.");
    return;
  }
  alert(reviews.map(r => `Rating: ${r.rating} - ${r.comment}`).join("\n"));
}

async function addReview(id) {
  const rating = Number(prompt("Enter rating (1-5):"));
  const comment = prompt("Enter your review:");
  if (!rating || rating < 1 || rating > 5 || !comment) {
    alert("Please provide a rating between 1 and 5 and a comment.");
    return;
  }
  await authFetch(`${API_BASE}/reviews/${id}?rating=${rating}&comment=${encodeURIComponent(comment)}`, { method: "POST" });
  alert("Review added!");
  viewProduct(id);
}

async function initApp() {
  console.debug('[initApp] start');
  // global error handlers to surface problems during dev
  window.addEventListener('error', (e) => console.error('[window.error]', e.message, e.error));
  window.addEventListener('unhandledrejection', (e) => console.error('[unhandledrejection]', e.reason));

  // Attach interactive handlers
  // Menu toggle is driven by the checkbox change handler to avoid label/checkbox click ordering issues
  document.querySelector(".brand")?.addEventListener("click", () => {
    showSection("home");
    closeMenu();
  });

  // keep checkbox and JS-driven menu in sync
  const menuCheckbox = document.getElementById('menu-toggle-checkbox');
  const nav = document.getElementById('main-nav');
  const menuToggleEl = document.getElementById('menu-toggle');
  if (menuCheckbox) {
    menuCheckbox.addEventListener('change', (e) => {
      try {
        if (e.target.checked) {
          if (nav) { nav.classList.add('menu-open'); nav.classList.remove('menu-closed'); }
          if (menuToggleEl) menuToggleEl.setAttribute('aria-expanded', 'true');
        } else {
          if (nav) { nav.classList.remove('menu-open'); nav.classList.add('menu-closed'); }
          if (menuToggleEl) menuToggleEl.setAttribute('aria-expanded', 'false');
        }
      } catch (err) { console.error('menuCheckbox change handler failed', err); }
    });
  }

  // Menu item bindings (for cases where inline onclick was removed)
  document.getElementById("notification-button")?.addEventListener("click", () => { closeMenu(); showNotifications(); });
  document.getElementById("cart-button")?.addEventListener("click", () => { closeMenu(); showSection('cart'); });
  document.getElementById("wishlist-button")?.addEventListener("click", () => { closeMenu(); showSection('wishlist'); });
  document.getElementById("auth-action-button")?.addEventListener("click", () => { authAction(); });
  document.getElementById("profile-button")?.addEventListener("click", () => { closeMenu(); showSection('profile'); });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    const nav = document.getElementById('main-nav');
    const btn = document.getElementById('menu-toggle');
    if (!nav || !nav.classList.contains('menu-open')) return;
    if (e.target.closest('#main-nav') || e.target.closest('#menu-toggle')) return;
    closeMenu();
  });

  try {
    await loadUser();
  } catch (err) {
    console.error('[initApp] loadUser failed', err);
    currentUser = null;
    updateUserArea();
  }

  try {
    await loadProducts();
  } catch (err) {
    console.error('[initApp] loadProducts failed', err);
    productsData = [];
    renderProducts([]);
  }

  if (currentUser) {
    showSection('home');
  } else {
    showSection('login');
  }
}

initApp();
