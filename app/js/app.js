"use strict";

const API_URL = "https://script.google.com/macros/s/AKfycbzWi2x4UZiRpmOGsx5fCsBOaH9tG3mG81Mv1aFG2BUrvxnAa3AdLWZ3X69BQLiJ2ZZ1gQ/exec";
const STORAGE_KEY = "maxbroadband.rememberedLogin";
const SESSION_KEY = "maxbroadband.customerSession";

const profileFields = [
    { key: "Customer Name", label: "Customer Name", icon: "ID" },
    { key: "Customer ID", label: "Customer ID", icon: "#" },
    { key: "Contact No", label: "Contact Number", icon: "PH" },
    { key: "Mail ID", label: "Mail ID", icon: "@" },
    { key: "address", label: "Address", icon: "AD" }
];

const planFields = [
    { key: "Plan home", label: "Plan Home", icon: "H" },
    { key: "Plan B", label: "Plan B", icon: "B" },
    { key: "OTT Plan", label: "OTT Plan", icon: "O" },
    { key: "TV Plan", label: "TV Plan", icon: "TV" },
    { key: "Device Detail", label: "Device Detail", icon: "D" },
    { key: "Installation  date", label: "Installation Date", icon: "IN" },
    { key: "Recharge date", label: "Recharge Date", icon: "RC" },
    { key: "Expiry Date", label: "Expiry Date", icon: "EX" }
];

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
    successToast: document.getElementById("successToast"),
    emptyState: document.getElementById("emptyState"),
    pullIndicator: document.getElementById("pullIndicator"),
    installButton: document.getElementById("installButton"),
    logoutButton: document.getElementById("logoutButton"),
    installOverlay: document.getElementById("installOverlay"),
    closeInstallSheet: document.getElementById("closeInstallSheet"),
    cancelInstall: document.getElementById("cancelInstall"),
    confirmInstall: document.getElementById("confirmInstall"),
    skeletonTemplate: document.getElementById("skeletonTemplate")
};

let currentCredentials = null;
let deferredInstallPrompt = null;
let touchStartY = 0;
let isRefreshing = false;

document.addEventListener("DOMContentLoaded", init);

function init() {
    hydrateRememberedLogin();
    bindEvents();
    setGreeting();
    restoreSession();
    registerServiceWorker();

    window.setTimeout(() => {
        els.splash.classList.add("is-hidden");
    }, 650);
}

function bindEvents() {
    els.loginForm.addEventListener("submit", handleLogin);
    els.logoutButton.addEventListener("click", logout);
    els.togglePassword.addEventListener("click", togglePasswordVisibility);
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.addEventListener("click", () => switchTab(button.dataset.tab));
    });
    document.querySelectorAll("button").forEach(addRipple);
    els.homeScreen.addEventListener("touchstart", handleTouchStart, { passive: true });
    els.homeScreen.addEventListener("touchmove", handleTouchMove, { passive: true });
    els.homeScreen.addEventListener("touchend", handleTouchEnd);
    els.installButton.addEventListener("click", openInstallSheet);
    els.closeInstallSheet.addEventListener("click", closeInstallSheet);
    els.cancelInstall.addEventListener("click", closeInstallSheet);
    els.confirmInstall.addEventListener("click", showInstallPrompt);
    els.installOverlay.addEventListener("click", (event) => {
        if (event.target === els.installOverlay) closeInstallSheet();
    });

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        els.installButton.classList.add("is-visible");
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

        saveSession(result.data || {});
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

function renderDashboard(data) {
    const customerName = getField(data, "Customer Name") || "Customer";
    const customerId = getField(data, "Customer ID") || "Customer ID unavailable";
    const planHome = getField(data, "Plan home") || "Broadband Plan";
    const expiryDate = getField(data, "Expiry Date");
    const status = getPlanStatus(expiryDate);

    els.headerName.textContent = customerName;
    els.headerCustomerId.textContent = customerId;
    els.avatar.textContent = getInitials(customerName);
    els.planTitle.textContent = planHome;
    els.daysLeft.textContent = getDaysLeftText(expiryDate);
    els.connectionStatus.textContent = status.label;
    updateStatusBadge(els.statusBadge, status);
    updateStatusBadge(els.planStatus, status);

    renderFieldCards(els.profileCards, profileFields, data);
    renderFieldCards(els.planCards, planFields, data);

    const hasDisplayedData = [...profileFields, ...planFields].some((field) => getField(data, field.key));
    els.emptyState.classList.toggle("is-visible", !hasDisplayedData);
    els.successToast.classList.add("is-visible");
    window.setTimeout(() => els.successToast.classList.remove("is-visible"), 2400);
}

function renderFieldCards(container, fields, data) {
    container.textContent = "";

    fields.forEach((field) => {
        const value = getField(data, field.key);
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

function getField(data, key) {
    const value = data[key];
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

function getPlanStatus(expiryValue) {
    const expiry = parseDate(expiryValue);
    if (!expiry) {
        return { label: "Not Available", badge: "-", className: "" };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiry >= today) {
        return { label: "Active", badge: "ACTIVE", className: "active" };
    }

    return { label: "Expired", badge: "EXPIRED", className: "expired" };
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

function showHome() {
    els.loginScreen.classList.remove("is-active");
    els.homeScreen.classList.add("is-active");
}

function showLogin() {
    els.homeScreen.classList.remove("is-active");
    els.loginScreen.classList.add("is-active");
}

function saveSession(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        data,
        savedAt: Date.now()
    }));
}

function restoreSession() {
    const savedSession = sessionStorage.getItem(SESSION_KEY);
    if (!savedSession) return;

    try {
        const parsed = JSON.parse(savedSession);
        if (!parsed.data) return;

        renderDashboard(parsed.data);
        showHome();
    } catch (error) {
        sessionStorage.removeItem(SESSION_KEY);
    }
}

function logout() {
    currentCredentials = null;
    sessionStorage.removeItem(SESSION_KEY);
    els.password.value = "";
    showError("");
    showLogin();
}

function showError(message) {
    els.loginError.textContent = message;
}

function setLoginLoading(isLoading) {
    els.loginButton.classList.toggle("is-loading", isLoading);
    els.loginButton.disabled = isLoading;
    els.loginButton.querySelector("span").textContent = isLoading ? "Signing In" : "Login Securely";
}

function switchTab(tabId) {
    document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === tabId);
    });
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tab === tabId);
    });
}

function setGreeting() {
    const hour = new Date().getHours();
    let greeting = "Good Night";

    if (hour >= 5 && hour < 12) greeting = "Good Morning";
    if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    if (hour >= 17 && hour < 21) greeting = "Good Evening";

    els.greeting.textContent = greeting;
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

    if (!shouldRefresh || isRefreshing || !currentCredentials) return;

    isRefreshing = true;
    showSkeletons();

    try {
        const result = await requestLogin(currentCredentials.loginid, currentCredentials.password);
        if (result.success) renderDashboard(result.data || {});
    } catch (error) {
        els.emptyState.classList.add("is-visible");
    } finally {
        isRefreshing = false;
    }
}

function showSkeletons() {
    els.profileCards.textContent = "";
    els.planCards.textContent = "";
    els.profileCards.appendChild(els.skeletonTemplate.content.cloneNode(true));
    els.planCards.appendChild(els.skeletonTemplate.content.cloneNode(true));
}

function openInstallSheet() {
    if (!deferredInstallPrompt) return;
    els.installOverlay.hidden = false;
}

function closeInstallSheet() {
    els.installOverlay.hidden = true;
}

async function showInstallPrompt() {
    if (!deferredInstallPrompt) return;

    closeInstallSheet();
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installButton.classList.remove("is-visible");
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

    navigator.serviceWorker.register("sw.js").catch(() => {
        // The app still works as a normal static site if service worker registration fails.
    });
}
