import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

const firebaseConfig = {
  apiKey: "AIzaSyAglgiWxVoXo6O8bLZOWCeJqYkRGjKzr0k",
  authDomain: "hammertime-d30bf.firebaseapp.com",
  projectId: "hammertime-d30bf",
  storageBucket: "hammertime-d30bf.firebasestorage.app",
  messagingSenderId: "607382441157",
  appId: "1:607382441157:web:410e1e5df3e35b39c2b4ac"
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const storage = getStorage(app)
