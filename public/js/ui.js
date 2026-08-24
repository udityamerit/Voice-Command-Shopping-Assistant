// public/js/ui.js - Dynamic UI rendering for modern quick-commerce storefront

export const UI = {
  /**
   * Shows a toast notification
   */
  showToast(message, type = "info", icon = "fa-circle-info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  /**
   * Renders the main product catalog grid (Blinkit / Amazon Fresh Style)
   */
  renderMainProducts(products = [], currentCart = [], callbacks = {}) {
    const grid = document.getElementById("mainProductsGrid");
    const countPill = document.getElementById("catalogProductCount");
    if (!grid) return;

    if (countPill) countPill.textContent = `${products.length} Products Available`;

    if (products.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.5;"></i>
          <h3>No products match your filter</h3>
          <p>Try resetting the price slider or search query.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = products.map(p => {
      // Check if product is already in shopping cart
      const cartItem = currentCart.find(i =>
        (i.productId && i.productId === p.id) ||
        i.name.toLowerCase() === p.name.toLowerCase()
      );

      const isAdded = Boolean(cartItem);
      const qty = cartItem ? cartItem.quantity : 0;

      let discountBadgeHtml = "";
      if (p.isSale && p.discountPercent) {
        discountBadgeHtml = `<span class="badge-discount">${p.discountPercent}% OFF</span>`;
      } else if (p.dietary && p.dietary.includes("Organic")) {
        discountBadgeHtml = `<span class="badge-discount" style="background:#059669;">ORGANIC</span>`;
      }

      let buttonHtml = "";
      if (isAdded) {
        buttonHtml = `
          <div class="card-stepper" data-id="${cartItem.id}">
            <button class="card-dec-btn" data-id="${cartItem.id}" data-qty="${qty - 1}"><i class="fa-solid fa-minus"></i></button>
            <span class="stepper-count">${qty}</span>
            <button class="card-inc-btn" data-id="${cartItem.id}" data-qty="${qty + 1}"><i class="fa-solid fa-plus"></i></button>
          </div>
        `;
      } else {
        buttonHtml = `
          <button class="btn-blinkit-add" data-product-id="${p.id}">
            ADD <i class="fa-solid fa-plus"></i>
          </button>
        `;
      }

      return `
        <div class="product-card" data-product-id="${p.id}">
          <div class="card-img-wrapper">
            <span class="badge-delivery-time"><i class="fa-solid fa-bolt"></i> ${p.deliveryTime || '8 MINS'}</span>
            ${discountBadgeHtml}
            <img src="${p.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80'}" alt="${escapeHtml(p.name)}" loading="lazy">
          </div>

          <div class="card-info">
            <div class="card-top-row">
              <span class="card-brand">${escapeHtml(p.brand || 'Fresh')}</span>
              <button class="card-rating-chip" data-product-id="${p.id}" title="Click to view verified customer reviews & web consensus">
                <i class="fa-solid fa-star"></i> ${(p.rating || 4.8).toFixed(1)} <span class="rating-count">(${p.reviewsCount || 250})</span>
              </button>
            </div>
            <h3 class="card-title" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h3>
            <span class="card-unit">${escapeHtml(p.unit || '1 unit')}</span>
          </div>

          <div class="card-bottom">
            <div class="price-container">
              <span class="current-price">$${p.price.toFixed(2)}</span>
              ${p.originalPrice ? `<span class="original-price">$${p.originalPrice.toFixed(2)}</span>` : ''}
            </div>
            ${buttonHtml}
          </div>
        </div>
      `;
    }).join("");

    // Attach listeners
    grid.querySelectorAll(".card-rating-chip").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const prodId = e.currentTarget.getAttribute("data-product-id");
        callbacks.onShowReviews?.(prodId);
      });
    });

    grid.querySelectorAll(".btn-blinkit-add").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const prodId = e.currentTarget.getAttribute("data-product-id");
        callbacks.onAddProduct?.(prodId);
      });
    });

    grid.querySelectorAll(".card-inc-btn, .card-dec-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const nextQty = parseInt(e.currentTarget.getAttribute("data-qty"), 10);
        if (nextQty > 0) {
          callbacks.onUpdateQuantity?.(id, nextQty);
        } else {
          callbacks.onDelete?.(id);
        }
      });
    });
  },

  /**
   * Renders the Active Shopping Cart list in the Dedicated Drawer & Syncs Previews
   */
  renderShoppingCartList(items = [], callbacks = {}) {
    const container = document.getElementById("shoppingListContainer");
    const headerCount = document.getElementById("headerCartCount");
    const headerTotal = document.getElementById("headerCartTotal");
    const sidebarCount = document.getElementById("sidebarCartCount");
    const sidebarTotal = document.getElementById("sidebarCartTotal");
    const drawerItemCount = document.getElementById("drawerItemCount");
    const drawerFooterTotal = document.getElementById("drawerFooterTotal");
    const billTotal = document.getElementById("billItemTotal");
    const grandTotal = document.getElementById("billGrandTotal");
    const drawerBudgetSpent = document.getElementById("drawerBudgetSpentDisplay");
    const drawerBudgetFill = document.getElementById("drawerBudgetFillBar");
    const floatingBar = document.getElementById("floatingCartBar");
    const floatingCount = document.getElementById("floatingCartCount");
    const floatingTotal = document.getElementById("floatingCartTotal");

    const totalCost = items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    const totalQty = items.reduce((acc, i) => acc + i.quantity, 0);

    // Sync all header, sidebar, drawer, and floating badges
    if (headerCount) headerCount.textContent = totalQty;
    if (headerTotal) headerTotal.textContent = `$${totalCost.toFixed(2)}`;
    if (sidebarCount) sidebarCount.textContent = `${totalQty} Item${totalQty === 1 ? '' : 's'} in Cart`;
    if (sidebarTotal) sidebarTotal.textContent = `$${totalCost.toFixed(2)}`;
    if (drawerItemCount) drawerItemCount.textContent = totalQty;
    if (drawerFooterTotal) drawerFooterTotal.textContent = `$${(totalCost > 0 ? totalCost + 0.50 : 0).toFixed(2)}`;
    if (billTotal) billTotal.textContent = `$${totalCost.toFixed(2)}`;
    if (grandTotal) grandTotal.textContent = `$${(totalCost > 0 ? totalCost + 0.50 : 0).toFixed(2)}`;

    // Budget Tracker update
    if (drawerBudgetSpent) drawerBudgetSpent.textContent = `$${totalCost.toFixed(2)} / $50.00`;
    if (drawerBudgetFill) {
      const pct = Math.min(100, Math.round((totalCost / 50) * 100));
      drawerBudgetFill.style.width = `${pct}%`;
    }


    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <i class="fa-solid fa-basket-shopping" style="font-size: 3rem; margin-bottom: 0.75rem; opacity: 0.35; color: var(--brand-green);"></i>
          <h4 style="font-size: 1.1rem; color: var(--text-main); font-weight: 800; margin-bottom: 0.3rem;">Your cart is empty</h4>
          <p style="font-size: 0.85rem; color: var(--text-sub);">Speak or tap ADD on any product to fill your cart.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const isCompleted = item.completed ? "completed" : "";
      return `
        <div class="cart-item-row ${isCompleted}" data-id="${item.id}">
          <div class="row-left">
            <span class="row-emoji">${item.emoji || "🛒"}</span>
            <div class="row-details">
              <span class="row-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
              <span class="row-sub">${item.quantity}x • $${item.price.toFixed(2)} / ${escapeHtml(item.unit || 'unit')}</span>
            </div>
          </div>

          <div class="row-right">
            <span class="row-price">$${(item.price * item.quantity).toFixed(2)}</span>
            <div class="card-stepper">
              <button class="cart-dec-btn" data-id="${item.id}" data-qty="${item.quantity - 1}"><i class="fa-solid fa-minus"></i></button>
              <span class="stepper-count">${item.quantity}</span>
              <button class="cart-inc-btn" data-id="${item.id}" data-qty="${item.quantity + 1}"><i class="fa-solid fa-plus"></i></button>
            </div>
            <button class="btn-share-clear item-del-btn" data-id="${item.id}" title="Remove item" style="padding: 0.3rem 0.5rem; font-size: 0.8rem;">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");

    // Attach listeners
    container.querySelectorAll(".cart-inc-btn, .cart-dec-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const nextQty = parseInt(e.currentTarget.getAttribute("data-qty"), 10);
        if (nextQty > 0) {
          callbacks.onUpdateQuantity?.(id, nextQty);
        } else {
          callbacks.onDelete?.(id);
        }
      });
    });

    container.querySelectorAll(".item-del-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        callbacks.onDelete?.(id);
      });
    });
  },

  /**
   * Renders Restock Suggestions
   */
  renderReplenishmentSuggestions(suggestions = [], onAdd) {
    const container = document.getElementById("replenishmentGrid");
    if (!container) return;

    if (suggestions.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 2rem 1rem; color: var(--text-muted);">
          <i class="fa-solid fa-circle-check" style="font-size: 1.8rem; color: var(--brand-green); margin-bottom: 0.5rem;"></i>
          <p style="font-size: 0.8rem;">Pantry fully stocked! No urgent restocks detected.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = suggestions.map(s => {
      const p = s.product;
      const isUrgent = s.urgency === "high";
      return `
        <div class="sugg-item-card">
          <div class="sugg-item-info">
            <span class="sugg-item-name">${p.emoji || '📦'} ${escapeHtml(p.name)}</span>
            <span class="sugg-item-reason ${isUrgent ? 'urgent' : ''}">${escapeHtml(s.reason)}</span>
          </div>
          <button class="btn-blinkit-add add-sugg-btn" data-id="${p.id}" style="padding: 0.25rem 0.75rem;">
            + $${p.price.toFixed(2)}
          </button>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".add-sugg-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        onAdd?.(id);
      });
    });
  },

  /**
   * Renders Seasonal Deals
   */
  renderSeasonalSuggestions(items = [], onAdd) {
    const container = document.getElementById("seasonalGrid");
    if (!container) return;

    container.innerHTML = items.map(s => {
      const p = s.product;
      return `
        <div class="sugg-item-card">
          <div class="sugg-item-info">
            <span class="sugg-item-name">${p.emoji || '🌟'} ${escapeHtml(p.name)}</span>
            <span class="sugg-item-reason sale">${escapeHtml(s.highlight)}</span>
          </div>
          <button class="btn-blinkit-add add-seasonal-btn" data-id="${p.id}" style="padding: 0.25rem 0.75rem;">
            + $${p.price.toFixed(2)}
          </button>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".add-seasonal-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        onAdd?.(id);
      });
    });
  },

  /**
   * Renders Substitutions
   */
  renderSubstitutes(data = {}, onAdd) {
    const container = document.getElementById("substitutesResults");
    if (!container) return;

    if (!data.target || !data.substitutes || data.substitutes.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 1.5rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
          No alternative products found. Try typing another item name above.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="font-size: 0.75rem; color: var(--text-sub); margin-bottom: 0.3rem;">
        Alternatives for <strong>${escapeHtml(data.target.name)}</strong>:
      </div>
      ${data.substitutes.map(sub => {
        const p = sub.product;
        return `
          <div class="sugg-item-card">
            <div class="sugg-item-info">
              <span class="sugg-item-name">${p.emoji || '🌱'} ${escapeHtml(p.name)}</span>
              <span class="sugg-item-reason" style="color: var(--brand-green); font-weight: 600;">${escapeHtml(sub.reason)}</span>
            </div>
            <button class="btn-blinkit-add add-sub-btn" data-id="${p.id}" style="padding: 0.25rem 0.75rem;">
              Swap ($${p.price.toFixed(2)})
            </button>
          </div>
        `;
      }).join("")}
    `;

    container.querySelectorAll(".add-sub-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        onAdd?.(id);
      });
    });
  },

  /**
   * Renders Hands-Free HUD Preview
   */
  renderHandsFreeCart(items = [], totalCost = "0.00") {
    const hudList = document.getElementById("hudCartList");
    const countEl = document.getElementById("hudItemCount");
    const totalEl = document.getElementById("hudTotalCost");

    if (countEl) countEl.textContent = items.length;
    if (totalEl) totalEl.textContent = `$${totalCost}`;

    if (hudList) {
      hudList.innerHTML = items.map(i =>
        `<span class="hud-pill">${i.emoji || "🛒"} ${i.quantity}x ${escapeHtml(i.name)}</span>`
      ).join("");
    }
  },

  /**
   * Renders the "Recommended For You" purchase-history carousel.
   * Each card shows: product image, urgency badge (Reorder Now / Running Low / Stock Up),
   * AI confidence meter bar, reason text, price, and Add to Cart button.
   */
  renderHistoryRecommendations(items = [], onAdd) {
    const track = document.getElementById("rfyCarouselTrack");
    const countPill = document.getElementById("rfyCountPill");
    if (!track) return;

    // Update count pill
    if (countPill) {
      countPill.textContent = items.length > 0
        ? `${items.length} item${items.length === 1 ? "" : "s"} to restock`
        : "All stocked up!";
    }

    if (items.length === 0) {
      track.innerHTML = `
        <div class="rfy-empty-state">
          <i class="fa-solid fa-circle-check" style="color: var(--brand-green);"></i>
          <strong>Pantry fully stocked!</strong>
          <span>No urgent restocks detected based on your purchase cycles.</span>
        </div>
      `;
      return;
    }

    track.innerHTML = items.map(item => {
      const p = item.product;
      const confidencePct = Math.round((item.confidence || 0.7) * 100);
      const isInCart = item.alreadyInCart;

      const urgencyBadge = `
        <span class="rfy-urgency-badge" style="background: ${item.urgencyColor || 'var(--brand-green)'}">
          ${item.urgencyLabel || "Stock Up"}
        </span>
      `;

      const inCartBadge = isInCart
        ? `<span class="rfy-incart-badge" title="Already in cart"><i class="fa-solid fa-check"></i></span>`
        : "";

      const addBtnHtml = isInCart
        ? `<button class="rfy-add-btn added" disabled data-id="${p.id}"><i class="fa-solid fa-check"></i> In Cart</button>`
        : `<button class="rfy-add-btn rfy-add-action" data-id="${p.id}" title="Add to cart">
            <i class="fa-solid fa-plus"></i> Add
           </button>`;

      return `
        <div class="rfy-card${isInCart ? " in-cart" : ""}" data-product-id="${p.id}">
          <div class="rfy-card-img-box">
            ${inCartBadge}
            ${urgencyBadge}
            <img
              src="${p.image}"
              alt="${escapeHtml(p.name)}"
              loading="lazy"
              onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80'"
            >
          </div>

          <div class="rfy-card-body">
            <span class="rfy-card-emoji">${p.emoji || "📦"}</span>
            <span class="rfy-card-brand">${escapeHtml(p.brand || "Fresh")}</span>
            <h3 class="rfy-card-name">${escapeHtml(p.name)}</h3>
            <p class="rfy-card-reason">${escapeHtml(item.reason || "Based on your purchase history")}</p>

            <div class="rfy-confidence-row">
              <span class="rfy-confidence-label">AI confidence</span>
              <div class="rfy-confidence-bar">
                <div class="rfy-confidence-fill" style="width: ${confidencePct}%"></div>
              </div>
              <span class="rfy-confidence-pct">${confidencePct}%</span>
            </div>
          </div>

          <div class="rfy-card-footer">
            <div>
              <div class="rfy-card-price">$${p.price.toFixed(2)}</div>
              <div class="rfy-card-unit">${escapeHtml(p.unit || "1 unit")}</div>
            </div>
            ${addBtnHtml}
          </div>
        </div>
      `;
    }).join("");

    // Attach Add to Cart listeners
    track.querySelectorAll(".rfy-add-action").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const originalHtml = btn.innerHTML;

        // Optimistic UI feedback
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
          await onAdd?.(id);

          // Success animation: flash green check
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Added!';
          btn.classList.add("added");

          // Mark card as in-cart
          const card = btn.closest(".rfy-card");
          if (card) card.classList.add("in-cart");
        } catch {
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }
      });
    });
  }
};


function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
