"use strict";

const CACHE_NAME = "maxbroadband-pwa-v10";
const APP_SHELL = [
    "./",
    "./index.html",
    "./offline.html",
    "./css/style.css",
    "./js/app.js",
    "./manifest.json",
    "./assets/favicon.svg",
    "./assets/icon-192.svg",
    "./assets/icon-512.svg",
    "./assets/icon-192.png",
    "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") return;

    if (request.url.includes("script.google.com")) {
        event.respondWith(fetch(request));
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                return response;
            })
            .catch(() => caches.match(request).then((cached) => cached || caches.match("./offline.html")))
    );
});







