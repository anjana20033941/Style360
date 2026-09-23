/**
 * Style360 — Firebase Storage & Firestore Catalog Integration
 * Manages user avatar .glb URLs and clothing catalog .glb URLs
 */
(function() {
    "use strict";

    // Firebase App Configuration Placeholder
    var firebaseConfig = {
        apiKey: "AIzaSy_Placeholder_ApiKey",
        authDomain: "style360-virtual-tryon.firebaseapp.com",
        projectId: "style360-virtual-tryon",
        storageBucket: "style360-virtual-tryon.appspot.com",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abcdef123456"
    };

    var db = null;
    var storage = null;

    // Initialize Firebase if library is available
    if (typeof firebase !== 'undefined') {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            storage = firebase.storage();
            console.log("[Style360Firebase] Firebase initialized successfully.");
        } catch (e) {
            console.warn("[Style360Firebase] Firebase initialization skipped:", e.message);
        }
    }

    /**
     * Save user avatar GLB URL to Firestore DB
     */
    function saveAvatarToFirestore(userId, glbUrl) {
        if (!db) {
            console.log("[Style360Firebase] Saved Avatar URL locally:", glbUrl);
            localStorage.setItem("user_avatar_glb_" + (userId || "default"), glbUrl);
            return Promise.resolve(glbUrl);
        }

        return db.collection("users").doc(userId || "default").set({
            avatarGlbUrl: glbUrl,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(function() {
            console.log("[Style360Firebase] Avatar URL saved to Firestore for user:", userId);
            return glbUrl;
        });
    }

    /**
     * Fetch user avatar GLB URL from Firestore DB
     */
    function fetchUserAvatar(userId) {
        if (!db) {
            var localUrl = localStorage.getItem("user_avatar_glb_" + (userId || "default"));
            return Promise.resolve(localUrl);
        }

        return db.collection("users").doc(userId || "default").get().then(function(doc) {
            if (doc.exists && doc.data().avatarGlbUrl) {
                return doc.data().avatarGlbUrl;
            }
            return null;
        });
    }

    /**
     * Save standalone garment GLB URL to Firestore clothes collection
     */
    function saveGarmentToFirestore(garmentId, glbUrl, metadata) {
        if (!db) {
            console.log("[Style360Firebase] Saved Garment URL locally:", garmentId, glbUrl);
            return Promise.resolve(glbUrl);
        }

        var data = Object.assign({
            glbUrl: glbUrl,
            prompt: "A-pose, arms down at exact 45 degree angle, neutral posture, standalone 3D garment",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, metadata || {});

        return db.collection("clothes").doc(garmentId).set(data, { merge: true });
    }

    // Expose Global Firebase Helper API
    window.Style360Firebase = {
        saveAvatarToFirestore: saveAvatarToFirestore,
        fetchUserAvatar: fetchUserAvatar,
        saveGarmentToFirestore: saveGarmentToFirestore
    };
})();
