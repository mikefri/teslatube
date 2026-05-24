# 🎵 TeslaTube

> Un lecteur de musique YouTube inspiré de Spotify — interface sombre, playlists synchronisées, lecture continue.

![Version](https://img.shields.io/badge/version-3.2-1db954?style=flat-square)
![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-orange?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)

---

## ✨ Fonctionnalités

- 🔍 **Recherche YouTube** avec cache et délai automatique (pas de spam API)
- ▶️ **Lecteur intégré** via YouTube IFrame API — lecture en arrière-plan
- 📂 **Playlists** — création, renommage, suppression, réorganisation par glisser-déposer
- ☁️ **Synchronisation Firebase** — playlists accessibles sur tous les appareils
- ❤️ **Titres likés** — playlist automatique `❤️ Titres likés`
- 🔀 **Shuffle & Repeat** fonctionnels
- 🕐 **File d'attente** avec drag & drop (souris et tactile)
- 🕓 **Historique de lecture** et historique de recherche
- 😴 **Sleep timer** — pause automatique après 15 min, 30 min ou 1 heure
- 🖼️ **Pochette mosaïque 2×2** générée automatiquement à partir des pistes
- 📱 **PWA installable** sur Android, iOS et desktop
- 🎮 **Media Session API** — contrôles sur écran de verrouillage / notification
- ⌨️ **Raccourcis clavier** — `Espace`, `→`, `←`


---

## 📸 Stack technique

| Couche | Technologie |
|---|---|
| Frontend | HTML / CSS / JavaScript vanilla |
| Player | YouTube IFrame API |
| Auth | Firebase Authentication (email/password) |
| Base de données | Firebase Firestore (temps réel) |
| Recherche | YouTube Data API v3 |
| Fonts | Plus Jakarta Sans, DM Mono |
| PWA | Web App Manifest + Service Worker |

---

## 🚀 Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/votre-utilisateur/teslatube.git
cd teslatube
```

### 2. Configurer Firebase

1. Créer un projet sur [Firebase Console](https://console.firebase.google.com)
2. Activer **Authentication** → Email/Password
3. Activer **Firestore Database**
4. Copier la config dans `script.js` :

```js
const firebaseConfig = {
  apiKey:            "VOTRE_API_KEY",
  authDomain:        "votre-projet.firebaseapp.com",
  projectId:         "votre-projet",
  storageBucket:     "votre-projet.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:xxxxxxxxxxxx"
};
```

### 3. Configurer la clé YouTube Data API

1. Aller sur [Google Cloud Console](https://console.cloud.google.com)
2. Activer **YouTube Data API v3**
3. Créer une clé API et la coller dans `script.js` :

```js
const YOUTUBE_API_KEY = "VOTRE_CLE_YOUTUBE";
```

### 4. Lancer

Ouvrir `index.html` dans un navigateur, ou déployer sur n'importe quel hébergement statique (Netlify, Vercel, GitHub Pages…).

---

## 📁 Structure du projet

```
teslatube/
├── index.html          # Structure HTML principale
├── style.css           # Styles desktop & tablette
├── mobile-fixes.css    # Correctifs mobile & paysage
├── script.js           # Logique principale (player, playlists, Firebase)
├── pwa.js              # Service Worker & installation PWA
├── manifest.json       # Manifeste PWA
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## 🔐 Règles Firestore recommandées

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/playlists/{playlistId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 📱 Installer comme application

Sur **Android** : ouvrir dans Chrome → menu ⋮ → *Ajouter à l'écran d'accueil*

Sur **iOS** : ouvrir dans Safari → bouton Partager → *Sur l'écran d'accueil*

Sur **Desktop** : icône d'installation dans la barre d'adresse Chrome/Edge

---

## ⚠️ Limitations connues

- Les publicités YouTube ne peuvent pas être bloquées depuis l'app (voir le guide intégré 🚫)
- La lecture en arrière-plan dépend du navigateur et de l'OS
- Le quota YouTube Data API est limité à **10 000 unités/jour** sur le plan gratuit

---

## 📄 Licence

MIT — libre d'utilisation, de modification et de distribution.
