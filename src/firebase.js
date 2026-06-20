import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth"
import { getStorage } from "firebase/storage"

const firebaseConfig = {
  apiKey: "AIzaSyAnOB8OMOV7TVhe25dcRupxtR6jNLw29Ks",
  authDomain: "padel-tracker-f0965.firebaseapp.com",
  projectId: "padel-tracker-f0965",
  storageBucket: "padel-tracker-f0965.firebasestorage.app",
  messagingSenderId: "745972249495",
  appId: "1:745972249495:web:8601fa1e93abc091a74ad2",
  measurementId: "G-8VETVJX2FK",
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)

export function initAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user)
      } else {
        signInAnonymously(auth).then((cred) => resolve(cred.user))
      }
    })
  })
}
