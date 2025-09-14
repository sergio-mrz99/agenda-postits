// ========= script.js (redirect-only) =========

// Usamos la config global definida en index.html
const firebaseConfig = window.firebaseConfig;

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut,
  GoogleAuthProvider, signInWithRedirect, linkWithRedirect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, where,
  orderBy, serverTimestamp, doc, deleteDoc, updateDoc,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

// Offline (si el navegador lo permite)
try { await enableIndexedDbPersistence(db); } catch { /* ignore */ }

// DOM refs
const form       = document.getElementById("form");
const muro       = document.getElementById("muro");
const userInfo   = document.getElementById("userInfo");
const logoutBtn  = document.getElementById("logoutBtn");
const googleBtn  = document.getElementById("googleBtn");

// Estado
let uid = null;
let unsubscribe = null;

// ---- Helpers UI ----
function setLoggedInUI(user) {
  const isGoogle = !!user.providerData?.length;
  userInfo.textContent = `${isGoogle ? "Google" : "Anónima"} · UID: ${user.uid}`;
  googleBtn.style.display = isGoogle ? "none" : "inline-block";
  logoutBtn.style.display = "inline-block";
}
function setLoggedOutUI() {
  userInfo.textContent = "Sin sesión";
  googleBtn.style.display = "inline-block";
  logoutBtn.style.display = "none";
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  muro.innerHTML = "";
}

// ---- AUTH + estado ----
onAuthStateChanged(auth, async (user) => {
  if (user) {
    uid = user.uid;
    setLoggedInUI(user);
    escucharMisPostits();
  } else {
    uid = null;
    setLoggedOutUI();
    await signInAnonymously(auth).catch(console.error);
  }
});

// ---- Login con Google (FORZAR REDIRECT SIEMPRE) ----
googleBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  try {
    if (user && user.isAnonymous) {
      // Mantiene tus notas: enlaza la sesión anónima con Google
      await linkWithRedirect(user, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
  } catch (err) {
    console.error(err);
    alert("Error al iniciar sesión con Google: " + (err?.message || err));
  }
});

logoutBtn?.addEventListener("click", async () => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  await signOut(auth);
});

// ---- Listener en tiempo real de MIS post-its ----
function escucharMisPostits() {
  if (!uid) return;
  if (unsubscribe) unsubscribe();

  const col = collection(db, "postits");
  const q = query(col, where("uid", "==", uid), orderBy("createdAt", "desc"));

  unsubscribe = onSnapshot(q, (snap) => {
    muro.innerHTML = "";
    snap.forEach((d) => {
      const p = d.data();
      const card = document.createElement("div");
      card.className = "postit";
      card.innerHTML = `
        <button class="del" data-id="${d.id}" title="Borrar">❌</button>
        <h3 contenteditable="true" class="editable" data-id="${d.id}" data-field="titulo">${escapeHTML(p.titulo || "")}</h3>
        <p  contenteditable="true" class="editable" data-id="${d.id}" data-field="notas">${escapeHTML(p.notas || "")}</p>
        <small>${escapeHTML(p.fecha || "")}</small>
      `;
      muro.appendChild(card);
    });

    // Borrar
    muro.querySelectorAll(".del").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        await deleteDoc(doc(db, "postits", id));
      };
    });

    // Guardar cambios al salir del campo (blur)
    muro.querySelectorAll(".editable").forEach(el => {
      el.onblur = async () => {
        const id    = el.getAttribute("data-id");
        const field = el.getAttribute("data-field");
        const value = el.innerText.trim();
        await updateDoc(doc(db, "postits", id), { [field]: value });
      };
    });
  }, console.error);
}

// ---- Crear post-it ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!uid) return;

  const fecha  = document.getElementById("fecha").value;
  const titulo = document.getElementById("titulo").value.trim();
  const notas  = document.getElementById("notas").value;

  if (!fecha || !titulo) return;

  await addDoc(collection(db, "postits"), {
    uid, fecha, titulo, notas,
    createdAt: serverTimestamp()
  });

  form.reset();
});

// ---- Utils ----
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
