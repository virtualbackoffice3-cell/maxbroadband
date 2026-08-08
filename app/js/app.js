"use strict";

const API_URL = "https://script.google.com/macros/s/AKfycbzWi2x4UZiRpmOGsx5fCsBOaH9tG3mG81Mv1aFG2BUrvxnAa3AdLWZ3X69BQLiJ2ZZ1gQ/exec";
const STORAGE_KEY = "maxbroadband.rememberedLogin";
const SESSION_KEY = "maxbroadband.customerSession";
const PERSISTENT_SESSION_KEY = "maxbroadband.persistentSession";
const DEFAULT_PAYMENT_NOTE = "MaxBroadband Recharge";
const PAYMENT_NOTIFICATION_COOLDOWN_MINUTES = 10;

const profileFields = [
    { key: "Customer Name", label: "Customer Name", icon: "ID" },
    { key: "Customer ID", label: "Customer ID", icon: "#" },
    { key: "Contact No", label: "Contact Number", icon: "PH" },
    { key: "Mail ID", label: "Mail ID", icon: "@" },
    { key: "address", label: "Address", icon: "AD" }
];

const planGroups = [
    {
        title: "Subscription",
        fields: [
            { key: "Plan home", label: "Plan Home", icon: "H" },
            { key: "Plan B", label: "Plan B", icon: "B" },
            { key: "OTT Plan", label: "OTT", icon: "O" },
            { key: "TV Plan", label: "TV", icon: "TV" }
        ]
    },
    {
        title: "Device",
        fields: [
            { key: "Device Detail", label: "Device Detail", icon: "D" },
            { key: "Installation  date", label: "Installation Date", icon: "IN", type: "date" },
            { key: "Recharge date", label: "Recharge Date", icon: "RC", type: "date" },
            { key: "Expiry Date", label: "Expiry Date", icon: "EX", type: "date" }
        ]
    }
];

const planFields = planGroups.flatMap((group) => group.fields);

const els = {
    splash: document.getElementById("splash"),
    loginScreen: document.getElementById("loginScreen"),
    homeScreen: document.getElementById("homeScreen"),
    loginForm: document.getElementById("loginForm"),
    loginid: document.getElementById("loginid"),
    password: document.getElementById("password"),
    rememberLogin: document.getElementById("rememberLogin"),
    togglePassword: document.getElementById("togglePassword"),
    loginButton: document.getElementById("loginButton"),
    loginError: document.getElementById("loginError"),
    greeting: document.getElementById("greeting"),
    headerName: document.getElementById("headerName"),
    headerCustomerId: document.getElementById("headerCustomerId"),
    avatar: document.getElementById("avatar"),
    profileCards: document.getElementById("profileCards"),
    planCards: document.getElementById("planCards"),
    planTitle: document.getElementById("planTitle"),
    planStatus: document.getElementById("planStatus"),
    daysLeft: document.getElementById("daysLeft"),
    connectionStatus: document.getElementById("connectionStatus"),
    statusBadge: document.getElementById("statusBadge"),
    expiryWarning: document.getElementById("expiryWarning"),
    rechargeNowButton: document.getElementById("rechargeNowButton"),
    warningTitle: document.getElementById("warningTitle"),
    warningMessage: document.getElementById("warningMessage"),
    warningAmount: document.getElementById("warningAmount"),
    successToast: document.getElementById("successToast"),
    toastText: document.getElementById("toastText"),
    emptyState: document.getElementById("emptyState"),
    rechargeCard: document.getElementById("rechargeCard"),
    rechargeAmount: document.getElementById("rechargeAmount"),
    rechargeStatus: document.getElementById("rechargeStatus"),
    qrLoader: document.getElementById("qrLoader"),
    qrCode: document.getElementById("qrCode"),
    barcodeText: document.getElementById("barcodeText"),
    paymentNote: document.getElementById("paymentNote"),
    copyUpiButton: document.getElementById("copyUpiButton"),
    pullIndicator: document.getElementById("pullIndicator"),
    installButtons: document.querySelectorAll(".install-btn"),
    installButton: document.getElementById("installButton"),
    refreshButton: document.getElementById("refreshButton"),
    logoutButton: document.getElementById("logoutButton"),
    rechargeNav: document.getElementById("rechargeNav"),
    bottomNav: document.querySelector(".bottom-nav"),
    installOverlay: document.getElementById("installOverlay"),
    closeInstallSheet: document.getElementById("closeInstallSheet"),
    cancelInstall: document.getElementById("cancelInstall"),
    confirmInstall: document.getElementById("confirmInstall"),
    skeletonTemplate: document.getElementById("skeletonTemplate")
};

let currentCredentials = null;
let currentCustomerData = null;
let deferredInstallPrompt = null;
let touchStartY = 0;
let isRefreshing = false;
let isPaymentNotificationInProgress = false;

document.addEventListener("DOMContentLoaded", init);

function init() {
    hydrateRememberedLogin();
    bindEvents();
    setGreeting();
    setInstallButtonsVisible(!isStandaloneApp());
    restoreSession();
    registerServiceWorker();

    window.setTimeout(() => {
        els.splash.classList.add("is-hidden");
    }, 650);
}

function bindEvents() {
    els.loginForm.addEventListener("submit", handleLogin);
    els.logoutButton.addEventListener("click", logout);
    els.refreshButton.addEventListener("click", () => refreshAccountData({ showLoading: true, toast: "Status updated" }));
    els.rechargeNowButton.addEventListener("click", () => switchTab("rechargeTab"));
    els.copyUpiButton.addEventListener("click", copyUpiId);
    document.querySelectorAll(".app-chip").forEach((button) => {
        button.addEventListener("click", () => openUpiApp(button.dataset.upiApp));
    });
    els.togglePassword.addEventListener("click", togglePasswordVisibility);
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.addEventListener("click", () => switchTab(button.dataset.tab));
    });
    document.querySelectorAll("button").forEach(addRipple);
    els.homeScreen.addEventListener("touchstart", handleTouchStart, { passive: true });
    els.homeScreen.addEventListener("touchmove", handleTouchMove, { passive: true });
    els.homeScreen.addEventListener("touchend", handleTouchEnd);
    els.installButtons.forEach((button) => button.addEventListener("click", openInstallSheet));
    els.closeInstallSheet.addEventListener("click", closeInstallSheet);
    els.cancelInstall.addEventListener("click", closeInstallSheet);
    els.confirmInstall.addEventListener("click", showInstallPrompt);
    els.installOverlay.addEventListener("click", (event) => {
        if (event.target === els.installOverlay) closeInstallSheet();
    });

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        setInstallButtonsVisible(true);
    });

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        setInstallButtonsVisible(false);
    });
}

function hydrateRememberedLogin() {
    const remembered = localStorage.getItem(STORAGE_KEY);
    if (!remembered) return;

    els.loginid.value = remembered;
    els.rememberLogin.checked = true;
}

async function handleLogin(event) {
    event.preventDefault();

    const loginid = els.loginid.value.trim();
    const password = els.password.value.trim();

    if (!loginid || !password) {
        showError("Please enter Login ID and Password.");
        return;
    }

    currentCredentials = { loginid, password };
    setLoginLoading(true);
    showError("");

    try {
        const result = await requestLogin(loginid, password);

        if (!result.success) {
            showError(result.message || "Invalid Login ID or Password.");
            return;
        }

        if (els.rememberLogin.checked) {
            localStorage.setItem(STORAGE_KEY, loginid);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }

        saveSession(result.data || {}, { loginid, password });
        renderDashboard(result.data || {});
        showHome();
    } catch (error) {
        showError(error.message || "Unable to connect. Please try again.");
    } finally {
        setLoginLoading(false);
    }
}

async function requestLogin(loginid, password) {
    const url = new URL(API_URL);
    url.searchParams.set("action", "login");
    url.searchParams.set("loginid", loginid);
    url.searchParams.set("password", password);

    const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error("Server is unavailable right now.");
    }

    return response.json();
}

function renderDashboard(data, { showLoginToast = true } = {}) {
    currentCustomerData = data || {};

    const customerName = getField(data, "Customer Name") || "Customer";
    const customerId = getField(data, "Customer ID") || "Customer ID unavailable";
    const planHome = getField(data, "Plan home") || "Broadband Plan";
    const expiryDate = getField(data, "Expiry Date");
    const status = getPlanStatus(expiryDate);
    const rechargeAmount = getField(data, "Recharge Amount");

    els.greeting.textContent = getGreeting();
    els.headerName.textContent = getFirstName(customerName);
    els.headerCustomerId.textContent = customerId;
    if (els.avatar) els.avatar.textContent = getInitials(customerName);
    els.planTitle.textContent = planHome;
    els.daysLeft.textContent = getDaysLeftText(expiryDate);
    els.warningAmount.textContent = rechargeAmount ? formatRechargeAmount(rechargeAmount) : "Amount unavailable";
    els.connectionStatus.textContent = getConnectionStatus(data, status);
    updateStatusBadge(els.statusBadge, status.requiresRecharge ? { badge: "RECHARGE", className: "required" } : status);
    updateStatusBadge(els.planStatus, status);
    updateRechargeVisibility(status.requiresRecharge, status);

    renderFieldCards(els.profileCards, profileFields, data);
    renderRechargeCard(data, status.requiresRecharge);
    renderPlanGroups(data);

    const hasRechargeData = Boolean(getField(data, "UPI ID") && getField(data, "Recharge Amount"));
    const hasDisplayedData = hasRechargeData || [...profileFields, ...planFields].some((field) => getField(data, field.key));
    els.emptyState.classList.toggle("is-visible", !hasDisplayedData);
    if (showLoginToast) showToast("Login successful");
}

function renderFieldCards(container, fields, data) {
    container.textContent = "";

    fields.forEach((field) => {
        const value = getDisplayValue(data, field);
        if (!value) return;

        const card = document.createElement("article");
        card.className = "detail-card";

        const icon = document.createElement("div");
        icon.className = "detail-icon";
        icon.textContent = field.icon;

        const body = document.createElement("div");
        const label = document.createElement("p");
        label.textContent = field.label;

        const strong = document.createElement("strong");
        strong.textContent = value;

        body.append(label, strong);
        card.append(icon, body);
        container.appendChild(card);
    });
}

function renderPlanGroups(data) {
    els.planCards.textContent = "";

    planGroups.forEach((group) => {
        const visibleFields = group.fields
            .map((field) => ({ ...field, value: getDisplayValue(data, field) }))
            .filter((field) => field.value);

        if (visibleFields.length === 0) return;

        const groupElement = document.createElement("section");
        groupElement.className = "detail-group";

        const title = document.createElement("h4");
        title.textContent = group.title;
        groupElement.appendChild(title);

        visibleFields.forEach((field) => {
            const card = document.createElement("article");
            card.className = "detail-card";

            const icon = document.createElement("div");
            icon.className = "detail-icon";
            icon.textContent = field.icon;

            const body = document.createElement("div");
            const label = document.createElement("p");
            label.textContent = field.label;

            const strong = document.createElement("strong");
            strong.textContent = field.value;

            body.append(label, strong);
            card.append(icon, body);
            groupElement.appendChild(card);
        });

        els.planCards.appendChild(groupElement);
    });
}

function getDisplayValue(data, field) {
    const value = getField(data, field.key);
    if (!value) return "";

    if (field.type === "date" || /date/i.test(field.key)) {
        return formatDateValue(value);
    }

    return value;
}

function getField(data, key) {
    const value = data[key];
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

function renderRechargeCard(data, shouldShowRecharge) {
    const upiId = getField(data, "UPI ID");
    const amount = getField(data, "Recharge Amount");
    const note = getField(data, "BarcodeText") || DEFAULT_PAYMENT_NOTE;

    if (!shouldShowRecharge || !upiId || !amount) {
        els.rechargeCard.hidden = true;
        els.qrCode.textContent = "";
        delete els.rechargeCard.dataset.upiUri;
        delete els.rechargeCard.dataset.upiId;
        return;
    }

    const upiUri = buildUpiUri({ upiId, amount, note });
    els.rechargeCard.hidden = false;
    els.rechargeAmount.textContent = formatRechargeAmount(amount);
    els.rechargeStatus.textContent = "Required";
    els.rechargeStatus.className = "recharge-chip required";
    els.barcodeText.textContent = note;
    els.paymentNote.textContent = "Share payment screenshot on mobile no - 9793322110";
    els.rechargeCard.dataset.upiUri = upiUri;
    els.rechargeCard.dataset.upiId = upiId;
    els.qrCode.classList.remove("is-ready");
    els.qrLoader.classList.remove("is-hidden");

    window.requestAnimationFrame(() => {
        try {
            els.qrCode.textContent = "";
            els.qrCode.appendChild(createQrCanvas(upiUri));
            els.qrCode.classList.add("is-ready");
        } catch (error) {
            els.qrCode.textContent = "QR unavailable";
            els.paymentNote.textContent = "Share payment screenshot on mobile no - 9793322110";
            els.qrCode.classList.add("is-ready");
        } finally {
            els.qrLoader.classList.add("is-hidden");
        }
    });
}

function buildUpiUri({ upiId, amount, note }) {
    const params = [
        ["pa", upiId],
        ["pn", "MaxBroadband"],
        ["am", normalizeAmount(amount)],
        ["tn", limitPaymentNote(note || DEFAULT_PAYMENT_NOTE)],
        ["cu", "INR"]
    ];

    return `upi://pay?${params.map(([key, value]) => `${key}=${encodeUpiParam(value)}`).join("&")}`;
}

function encodeUpiParam(value) {
    return encodeURIComponent(String(value).trim()).replace(/%40/g, "@");
}

function limitPaymentNote(note) {
    return String(note).trim().slice(0, 35) || DEFAULT_PAYMENT_NOTE;
}

function normalizeAmount(value) {
    return String(value).replace(/[^\d.]/g, "");
}

function formatRechargeAmount(value) {
    const amount = Number(normalizeAmount(value));
    if (!Number.isFinite(amount)) return `Rs. ${value}`;

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
}

function formatDateValue(value) {
    const parsed = parseDate(value);
    if (!parsed) return value;

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(parsed);
}

function getPlanStatus(expiryValue) {
    const expiry = parseDate(expiryValue);
    if (!expiry) {
        return { label: "Disconnected", badge: "CHECK", className: "required", requiresRecharge: false, daysUntilExpiry: null, isExpired: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntilExpiry > 4) {
        return { label: "Active", badge: "ACTIVE", className: "active", requiresRecharge: false, daysUntilExpiry, isExpired: false };
    }

    if (daysUntilExpiry >= 0) {
        return { label: "Active", badge: "DUE SOON", className: "required", requiresRecharge: true, daysUntilExpiry, isExpired: false };
    }

    return { label: "Suspended", badge: "EXPIRED", className: "expired", requiresRecharge: true, daysUntilExpiry, isExpired: true };
}

function getConnectionStatus(data, planStatus) {
    if (planStatus.isExpired) return "Recharge Required";
    if (planStatus.requiresRecharge) return "Recharge Due Soon";

    const statusValue = [
        "Connection Status",
        "Service Status",
        "Account Status",
        "Status"
    ].map((key) => getField(data, key)).find(Boolean);

    if (!statusValue) return planStatus.label;

    const normalized = statusValue.toLowerCase();
    if (normalized.includes("disconnect")) return "Disconnected";
    if (normalized.includes("suspend")) return "Suspended";
    if (normalized.includes("active")) return "Active";
    if (normalized.includes("recharge")) return "Recharge Required";

    return statusValue;
}

function getDaysLeftText(expiryValue) {
    const expiry = parseDate(expiryValue);
    if (!expiry) return "Plan validity unavailable";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / oneDay);

    if (diffDays > 1) return `${diffDays} days left`;
    if (diffDays === 1) return "1 day left";
    if (diffDays === 0) return "Expires today";
    if (diffDays === -1) return "Expired 1 day ago";
    return `Expired ${Math.abs(diffDays)} days ago`;
}

function parseDate(value) {
    if (!value) return null;

    const raw = String(value).trim();
    const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) {
        const parsed = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
        parsed.setHours(0, 0, 0, 0);
        return parsed;
    }

    const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]) - 1;
        const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
        const parsed = new Date(year, month, day);

        if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) {
            return null;
        }

        parsed.setHours(0, 0, 0, 0);
        return parsed;
    }

    const nativeDate = new Date(raw);
    if (Number.isNaN(nativeDate.getTime())) {
        return null;
    }

    nativeDate.setHours(0, 0, 0, 0);
    return nativeDate;
}

function updateStatusBadge(element, status) {
    element.textContent = status.badge;
    element.className = `status-badge ${status.className}`.trim();
}

function updateRechargeVisibility(shouldShowRecharge, status = {}) {
    els.rechargeNav.hidden = !shouldShowRecharge;
    els.expiryWarning.hidden = !shouldShowRecharge;
    els.bottomNav.classList.toggle("has-recharge", shouldShowRecharge);

    if (shouldShowRecharge) {
        if (status.isExpired) {
            els.warningTitle.textContent = "Your broadband plan has expired.";
            els.warningMessage.textContent = "Internet service may remain suspended until payment is completed.";
        } else if (status.daysUntilExpiry === 0) {
            els.warningTitle.textContent = "Your broadband plan expires today.";
            els.warningMessage.textContent = "Recharge now to avoid interruption in your internet service.";
        } else {
            els.warningTitle.textContent = `Your plan expires in ${status.daysUntilExpiry} day${status.daysUntilExpiry === 1 ? "" : "s"}.`;
            els.warningMessage.textContent = "Recharge early to keep your broadband service uninterrupted.";
        }
    }

    if (!shouldShowRecharge && document.getElementById("rechargeTab").classList.contains("is-active")) {
        switchTab("planTab");
    }
}

function showHome() {
    els.loginScreen.classList.remove("is-active");
    els.homeScreen.classList.add("is-active");
}

function showLogin() {
    els.homeScreen.classList.remove("is-active");
    els.loginScreen.classList.add("is-active");
}

function isStandaloneApp() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function setInstallButtonsVisible(isVisible) {
    els.installButtons.forEach((button) => button.classList.toggle("is-visible", isVisible));
}

function saveSession(data, credentials = null) {
    const payload = {
        data,
        credentials,
        savedAt: Date.now()
    };

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    if (credentials) {
        localStorage.setItem(PERSISTENT_SESSION_KEY, JSON.stringify(payload));
    }
}

function restoreSession() {
    const savedSession = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(PERSISTENT_SESSION_KEY);
    if (!savedSession) return;

    try {
        const parsed = JSON.parse(savedSession);
        if (!parsed.data) return;

        currentCredentials = parsed.credentials || null;
        renderDashboard(parsed.data, { showLoginToast: false });
        showHome();
        if (currentCredentials) {
            refreshAccountData({ silent: true });
        }
    } catch (error) {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(PERSISTENT_SESSION_KEY);
    }
}

function logout() {
    currentCredentials = null;
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PERSISTENT_SESSION_KEY);
    els.password.value = "";
    showError("");
    showLogin();
}

function showError(message) {
    els.loginError.textContent = message;
}

function showToast(message) {
    els.toastText.textContent = message;
    els.successToast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.successToast.classList.remove("is-visible"), 2400);
}

async function refreshAccountData({ showLoading = false, silent = false, toast = "Refreshed Successfully" } = {}) {
    if (!currentCredentials || isRefreshing) return;

    isRefreshing = true;
    els.refreshButton.classList.toggle("is-loading", showLoading);
    if (showLoading) showSkeletons();

    try {
        const result = await requestLogin(currentCredentials.loginid, currentCredentials.password);
        if (!result.success) {
            if (!silent) showToast(result.message || "Refresh failed");
            return;
        }

        saveSession(result.data || {}, currentCredentials);
        renderDashboard(result.data || {}, { showLoginToast: false });
        if (!silent) showToast(toast);
    } catch (error) {
        if (!silent) showToast("Unable to refresh right now");
    } finally {
        isRefreshing = false;
        els.refreshButton.classList.remove("is-loading");
    }
}

function setLoginLoading(isLoading) {
    els.loginButton.classList.toggle("is-loading", isLoading);
    els.loginButton.disabled = isLoading;
    els.loginButton.querySelector("span").textContent = isLoading ? "Signing In" : "Login Securely";
}

function switchTab(tabId) {
    const targetNav = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    if (targetNav && targetNav.hidden) return;

    document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === tabId);
    });
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tab === tabId);
    });

    if (tabId === "rechargeTab") {
        window.setTimeout(notifyPaymentInitiated, 0);
    }
}

async function notifyPaymentInitiated() {
    if (!currentCustomerData) return;

    const customerId = getField(currentCustomerData, "Customer ID");
    if (!customerId || isPaymentNotificationInProgress || isPaymentNotificationInCooldown(customerId)) return;

    isPaymentNotificationInProgress = true;

    try {
        const params = new URLSearchParams({
            action: "payment_initiated",
            customerName: getField(currentCustomerData, "Customer Name"),
            customerId,
            contactNo: getField(currentCustomerData, "Contact No"),
            customerEmail: getField(currentCustomerData, "Mail ID"),
            amount: getField(currentCustomerData, "Recharge Amount"),
            paymentMode: "UPI",
            plan: getField(currentCustomerData, "Plan home"),
            expiryDate: getField(currentCustomerData, "Expiry Date")
        });

        const response = await fetch(`${API_URL}?${params.toString()}`, {
            method: "GET",
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Payment notification request failed.");
        }

        const result = await response.json();
        if (result && result.success === true) {
            localStorage.setItem(getPaymentNotificationStorageKey(customerId), String(Date.now()));
        }
    } catch (error) {
        console.error("Payment initiation notification failed:", error);
    } finally {
        isPaymentNotificationInProgress = false;
    }
}

function isPaymentNotificationInCooldown(customerId) {
    const lastSent = Number(localStorage.getItem(getPaymentNotificationStorageKey(customerId)));
    if (!lastSent) return false;

    return Date.now() - lastSent < PAYMENT_NOTIFICATION_COOLDOWN_MINUTES * 60 * 1000;
}

function getPaymentNotificationStorageKey(customerId) {
    return `maxbroadband.paymentNotification.${customerId}`;
}

function setGreeting() {
    const hour = new Date().getHours();
    let greeting = "Good Night";

    if (hour >= 5 && hour < 12) greeting = "Good Morning";
    if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    if (hour >= 17 && hour < 21) greeting = "Good Evening";

    els.greeting.textContent = greeting;
}

function getGreeting() {
    const hour = new Date().getHours();
    const variants = {
        morning: ["Good Morning", "Welcome back"],
        afternoon: ["Good Afternoon", "Welcome back"],
        evening: ["Good Evening", "Hope you're having a great day"],
        night: ["Good Night", "Welcome back"]
    };
    let bucket = variants.night;

    if (hour >= 5 && hour < 12) bucket = variants.morning;
    if (hour >= 12 && hour < 17) bucket = variants.afternoon;
    if (hour >= 17 && hour < 21) bucket = variants.evening;

    return bucket[new Date().getDate() % bucket.length];
}

function getFirstName(name) {
    return String(name || "Customer").trim().split(/\s+/)[0] || "Customer";
}

function getInitials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "MB";
}

function togglePasswordVisibility() {
    const isPassword = els.password.type === "password";
    els.password.type = isPassword ? "text" : "password";
    els.togglePassword.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
}

function addRipple(button) {
    button.addEventListener("click", (event) => {
        const circle = document.createElement("span");
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const rect = button.getBoundingClientRect();

        circle.style.width = `${diameter}px`;
        circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - rect.left - diameter / 2}px`;
        circle.style.top = `${event.clientY - rect.top - diameter / 2}px`;
        circle.className = "ripple";

        button.appendChild(circle);
        window.setTimeout(() => circle.remove(), 560);
    });
}

function openUpiApp(appName = "") {
    const upiUri = els.rechargeCard.dataset.upiUri;
    if (!upiUri) return;

    showToast(appName ? `Opening ${appName}` : "Payment Request Created");
    window.location.href = upiUri;
}

async function copyUpiId() {
    const upiId = els.rechargeCard.dataset.upiId;
    if (!upiId) return;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(upiId);
        } else {
            copyTextFallback(upiId);
        }
        showToast("UPI ID copied");
    } catch (error) {
        showToast("Copy failed");
    }
}

function copyTextFallback(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
}

function handleTouchStart(event) {
    touchStartY = event.touches[0].clientY;
}

function handleTouchMove(event) {
    const pullDistance = event.touches[0].clientY - touchStartY;
    const canPull = window.scrollY <= 0 && pullDistance > 55;
    els.pullIndicator.classList.toggle("is-visible", canPull);
}

async function handleTouchEnd() {
    const shouldRefresh = els.pullIndicator.classList.contains("is-visible");
    els.pullIndicator.classList.remove("is-visible");

    if (!shouldRefresh || !currentCredentials) return;

    refreshAccountData({ showLoading: true, toast: "Refreshed Successfully" });
}

function showSkeletons() {
    els.profileCards.textContent = "";
    els.planCards.textContent = "";
    els.profileCards.appendChild(els.skeletonTemplate.content.cloneNode(true));
    els.planCards.appendChild(els.skeletonTemplate.content.cloneNode(true));
}

function openInstallSheet() {
    els.installOverlay.hidden = false;
}

function closeInstallSheet() {
    els.installOverlay.hidden = true;
}

async function showInstallPrompt() {
    if (!deferredInstallPrompt) {
        closeInstallSheet();
        showToast("Use the browser install icon to add MaxBroadband.");
        return;
    }

    closeInstallSheet();
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    setInstallButtonsVisible(false);
}

function createQrCanvas(text) {
    const matrix = createQrMatrix(text);
    const quiet = 4;
    const modules = matrix.length + quiet * 2;
    const scale = 10;
    const canvas = document.createElement("canvas");
    const size = modules * scale;
    const context = canvas.getContext("2d");

    canvas.width = size;
    canvas.height = size;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "UPI payment QR code");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#101828";

    matrix.forEach((row, y) => {
        row.forEach((isDark, x) => {
            if (isDark) {
                context.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
            }
        });
    });

    return canvas;
}

function createQrSvg(text) {
    const matrix = createQrMatrix(text);
    const quiet = 4;
    const size = matrix.length;
    let path = "";

    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            if (matrix[row][col]) {
                path += `M${col + quiet},${row + quiet}h1v1h-1z`;
            }
        }
    }

    const viewBox = size + quiet * 2;
    return `<svg viewBox="0 0 ${viewBox} ${viewBox}" role="img" aria-label="UPI payment QR code" xmlns="http://www.w3.org/2000/svg"><rect width="${viewBox}" height="${viewBox}" fill="#fff"/><path d="${path}" fill="#101828"/></svg>`;
}

function createQrMatrix(text) {
    const configs = [
        { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, blockDataLengths: [108], alignmentCenters: [6, 30] },
        { version: 6, size: 41, dataCodewords: 136, ecCodewords: 18, blockDataLengths: [68, 68], alignmentCenters: [6, 34] },
        { version: 7, size: 45, dataCodewords: 156, ecCodewords: 20, blockDataLengths: [78, 78], alignmentCenters: [6, 22, 38] },
        { version: 8, size: 49, dataCodewords: 194, ecCodewords: 24, blockDataLengths: [97, 97], alignmentCenters: [6, 24, 42] }
    ];
    const textLength = Array.from(new TextEncoder().encode(text)).length;
    const config = configs.find((item) => textLength <= item.dataCodewords - 3) || configs[configs.length - 1];
    const data = encodeQrData(text, config);
    const codewords = addQrErrorCorrection(data, config);
    const matrix = Array.from({ length: config.size }, () => Array(config.size).fill(null));
    const functionModules = Array.from({ length: config.size }, () => Array(config.size).fill(false));

    drawQrFunctionPatterns(matrix, functionModules, config);
    reserveQrMetadata(functionModules, config);
    drawQrCodewords(matrix, functionModules, codewords);
    return chooseBestQrMask(matrix, functionModules, config.version);
}

function chooseBestQrMask(baseMatrix, functionModules, version) {
    let bestMatrix = null;
    let bestPenalty = Infinity;

    for (let mask = 0; mask < 8; mask += 1) {
        const candidate = baseMatrix.map((row) => row.slice());
        applyQrMask(candidate, functionModules, mask);
        drawQrFormatBits(candidate, functionModules, mask);
        drawQrVersionBits(candidate, functionModules, version);

        const penalty = getQrPenalty(candidate);
        if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestMatrix = candidate;
        }
    }

    return bestMatrix.map((row) => row.map(Boolean));
}

function encodeQrData(text, config) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const dataCodewords = config.dataCodewords;
    const maxBytes = dataCodewords - 3;
    if (bytes.length > maxBytes) {
        throw new Error("Recharge QR data is too long.");
    }

    const bits = [];
    const charCountBits = config.version < 10 ? 8 : 16;
    appendQrBits(bits, 0x4, 4);
    appendQrBits(bits, bytes.length, charCountBits);
    bytes.forEach((byte) => appendQrBits(bits, byte, 8));

    const maxBits = dataCodewords * 8;
    appendQrBits(bits, 0, Math.min(4, maxBits - bits.length));
    while (bits.length % 8 !== 0) appendQrBits(bits, 0, 1);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
        data.push(Number.parseInt(bits.slice(i, i + 8).join(""), 2));
    }

    for (let pad = 0xec; data.length < dataCodewords; pad ^= 0xfd) {
        data.push(pad);
    }

    return data;
}

function appendQrBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i -= 1) {
        bits.push((value >>> i) & 1);
    }
}

function addQrErrorCorrection(data, config) {
    const blocks = [];
    let offset = 0;

    config.blockDataLengths.forEach((length) => {
        const block = data.slice(offset, offset + length);
        offset += length;
        blocks.push({
            data: block,
            ecc: reedSolomonCompute(block, config.ecCodewords)
        });
    });

    const result = [];
    const maxDataLength = Math.max(...config.blockDataLengths);

    for (let i = 0; i < maxDataLength; i += 1) {
        blocks.forEach((block) => {
            if (i < block.data.length) result.push(block.data[i]);
        });
    }

    for (let i = 0; i < config.ecCodewords; i += 1) {
        blocks.forEach((block) => result.push(block.ecc[i]));
    }

    return result;
}

function reedSolomonCompute(data, degree) {
    const generator = reedSolomonGenerator(degree);
    const result = Array(degree).fill(0);

    data.forEach((byte) => {
        const factor = byte ^ result.shift();
        result.push(0);
        generator.slice(1).forEach((coefficient, index) => {
            result[index] ^= gfMultiply(coefficient, factor);
        });
    });

    return result;
}

function reedSolomonGenerator(degree) {
    let generator = [1];

    for (let i = 0; i < degree; i += 1) {
        generator = polynomialMultiply(generator, [1, gfPow(2, i)]);
    }

    return generator;
}

function polynomialMultiply(left, right) {
    const result = Array(left.length + right.length - 1).fill(0);

    left.forEach((leftValue, leftIndex) => {
        right.forEach((rightValue, rightIndex) => {
            result[leftIndex + rightIndex] ^= gfMultiply(leftValue, rightValue);
        });
    });

    return result;
}

function gfPow(value, power) {
    let result = 1;
    for (let i = 0; i < power; i += 1) result = gfMultiply(result, value);
    return result;
}

function gfMultiply(left, right) {
    let result = 0;

    for (let i = 0; i < 8; i += 1) {
        if ((right & 1) !== 0) result ^= left;
        const carry = (left & 0x80) !== 0;
        left = (left << 1) & 0xff;
        if (carry) left ^= 0x1d;
        right >>>= 1;
    }

    return result;
}

function drawQrFunctionPatterns(matrix, functionModules, config) {
    drawFinder(matrix, functionModules, 0, 0);
    drawFinder(matrix, functionModules, config.size - 7, 0);
    drawFinder(matrix, functionModules, 0, config.size - 7);

    for (let i = 0; i < config.size; i += 1) {
        if (!functionModules[6][i]) setQrModule(matrix, functionModules, 6, i, i % 2 === 0, true);
        if (!functionModules[i][6]) setQrModule(matrix, functionModules, i, 6, i % 2 === 0, true);
    }

    config.alignmentCenters.forEach((row) => {
        config.alignmentCenters.forEach((col) => {
            const overlapsFinder = (row === 6 && col === 6) || (row === 6 && col === config.size - 7) || (row === config.size - 7 && col === 6);
            if (!overlapsFinder) drawAlignment(matrix, functionModules, row - 2, col - 2);
        });
    });

    setQrModule(matrix, functionModules, config.size - 8, 8, true, true);
}

function reserveQrMetadata(functionModules, config) {
    const size = config.size;

    for (let i = 0; i <= 8; i += 1) {
        if (i !== 6) {
            functionModules[8][i] = true;
            functionModules[i][8] = true;
        }
    }

    for (let i = 0; i < 8; i += 1) {
        functionModules[size - 1 - i][8] = true;
        functionModules[8][size - 1 - i] = true;
    }

    if (config.version >= 7) {
        for (let row = 0; row < 6; row += 1) {
            for (let col = size - 11; col < size - 8; col += 1) {
                functionModules[row][col] = true;
                functionModules[col][row] = true;
            }
        }
    }
}

function drawFinder(matrix, functionModules, row, col) {
    for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
            const currentRow = row + y;
            const currentCol = col + x;
            if (!isInsideQr(matrix.length, currentRow, currentCol)) continue;

            const isDark = x >= 0 && x <= 6 && y >= 0 && y <= 6 && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
            setQrModule(matrix, functionModules, currentRow, currentCol, isDark, true);
        }
    }
}

function drawAlignment(matrix, functionModules, row, col) {
    for (let y = 0; y < 5; y += 1) {
        for (let x = 0; x < 5; x += 1) {
            const isDark = x === 0 || x === 4 || y === 0 || y === 4 || (x === 2 && y === 2);
            setQrModule(matrix, functionModules, row + y, col + x, isDark, true);
        }
    }
}

function drawQrCodewords(matrix, functionModules, codewords) {
    const bits = [];
    codewords.forEach((codeword) => appendQrBits(bits, codeword, 8));

    let bitIndex = 0;
    let upward = true;

    for (let col = matrix.length - 1; col > 0; col -= 2) {
        if (col === 6) col -= 1;

        for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
            const row = upward ? matrix.length - 1 - rowOffset : rowOffset;

            for (let currentCol = col; currentCol >= col - 1; currentCol -= 1) {
                if (functionModules[row][currentCol]) continue;
                matrix[row][currentCol] = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
                bitIndex += 1;
            }
        }

        upward = !upward;
    }
}

function applyQrMask(matrix, functionModules, mask) {
    for (let row = 0; row < matrix.length; row += 1) {
        for (let col = 0; col < matrix.length; col += 1) {
            if (!functionModules[row][col] && shouldMaskQrModule(mask, row, col)) {
                matrix[row][col] = !matrix[row][col];
            }
        }
    }
}

function shouldMaskQrModule(mask, row, col) {
    if (mask === 0) return (row + col) % 2 === 0;
    if (mask === 1) return row % 2 === 0;
    if (mask === 2) return col % 3 === 0;
    if (mask === 3) return (row + col) % 3 === 0;
    if (mask === 4) return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    if (mask === 5) return ((row * col) % 2) + ((row * col) % 3) === 0;
    if (mask === 6) return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
}

function getQrPenalty(matrix) {
    const size = matrix.length;
    let penalty = 0;

    for (let y = 0; y < size; y += 1) {
        let runColor = matrix[y][0];
        let runLength = 1;
        for (let x = 1; x < size; x += 1) {
            if (matrix[y][x] === runColor) {
                runLength += 1;
            } else {
                if (runLength >= 5) penalty += 3 + runLength - 5;
                runColor = matrix[y][x];
                runLength = 1;
            }
        }
        if (runLength >= 5) penalty += 3 + runLength - 5;
    }

    for (let x = 0; x < size; x += 1) {
        let runColor = matrix[0][x];
        let runLength = 1;
        for (let y = 1; y < size; y += 1) {
            if (matrix[y][x] === runColor) {
                runLength += 1;
            } else {
                if (runLength >= 5) penalty += 3 + runLength - 5;
                runColor = matrix[y][x];
                runLength = 1;
            }
        }
        if (runLength >= 5) penalty += 3 + runLength - 5;
    }

    for (let y = 0; y < size - 1; y += 1) {
        for (let x = 0; x < size - 1; x += 1) {
            const color = matrix[y][x];
            if (color === matrix[y][x + 1] && color === matrix[y + 1][x] && color === matrix[y + 1][x + 1]) {
                penalty += 3;
            }
        }
    }

    const pattern = [true, false, true, true, true, false, true, false, false, false, false];
    const reversePattern = pattern.slice().reverse();
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x <= size - 11; x += 1) {
            const slice = matrix[y].slice(x, x + 11);
            if (matchesQrPattern(slice, pattern) || matchesQrPattern(slice, reversePattern)) penalty += 40;
        }
    }
    for (let x = 0; x < size; x += 1) {
        for (let y = 0; y <= size - 11; y += 1) {
            const slice = [];
            for (let i = 0; i < 11; i += 1) slice.push(matrix[y + i][x]);
            if (matchesQrPattern(slice, pattern) || matchesQrPattern(slice, reversePattern)) penalty += 40;
        }
    }

    const darkCount = matrix.flat().filter(Boolean).length;
    const darkPercent = (darkCount * 100) / (size * size);
    penalty += Math.floor(Math.abs(darkPercent - 50) / 5) * 10;

    return penalty;
}

function matchesQrPattern(values, pattern) {
    return pattern.every((value, index) => values[index] === value);
}

function drawQrFormatBits(matrix, functionModules, mask) {
    const format = calculateBch((1 << 3) | mask, 0x537, 10) ^ 0x5412;
    const size = matrix.length;

    for (let i = 0; i < 15; i += 1) {
        const value = getQrBit(format, i);

        if (i < 6) {
            setQrModule(matrix, functionModules, i, 8, value, true);
        } else if (i < 8) {
            setQrModule(matrix, functionModules, i + 1, 8, value, true);
        } else {
            setQrModule(matrix, functionModules, size - 15 + i, 8, value, true);
        }

        if (i < 8) {
            setQrModule(matrix, functionModules, 8, size - i - 1, value, true);
        } else if (i < 9) {
            setQrModule(matrix, functionModules, 8, 8, value, true);
        } else {
            setQrModule(matrix, functionModules, 8, 14 - i, value, true);
        }
    }

    setQrModule(matrix, functionModules, size - 8, 8, true, true);
}

function drawQrVersionBits(matrix, functionModules, version) {
    if (version < 7) return;

    const bits = calculateBch(version, 0x1f25, 12);
    const size = matrix.length;

    for (let i = 0; i < 18; i += 1) {
        const bit = getQrBit(bits, i);
        const row = Math.floor(i / 3);
        const col = i % 3;
        setQrModule(matrix, functionModules, row, size - 11 + col, bit, true);
        setQrModule(matrix, functionModules, size - 11 + col, row, bit, true);
    }
}

function calculateBch(value, polynomial, degree) {
    let result = value << degree;
    const topBit = getBchTopBit(polynomial);

    while (getBchTopBit(result) >= topBit) {
        result ^= polynomial << (getBchTopBit(result) - topBit);
    }

    return (value << degree) | result;
}

function getBchTopBit(value) {
    let bit = -1;
    while (value > 0) {
        value >>>= 1;
        bit += 1;
    }
    return bit;
}

function getQrBit(value, index) {
    return ((value >>> index) & 1) !== 0;
}

function setQrModule(matrix, functionModules, row, col, value, isFunction) {
    if (!isInsideQr(matrix.length, row, col)) return;
    matrix[row][col] = value;
    if (isFunction) functionModules[row][col] = true;
}

function isInsideQr(size, row, col) {
    return row >= 0 && row < size && col >= 0 && col < size;
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

    navigator.serviceWorker.register("sw.js").catch(() => {
        // The app still works as a normal static site if service worker registration fails.
    });
}

