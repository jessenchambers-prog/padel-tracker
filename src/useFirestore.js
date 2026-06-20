import { useState, useEffect } from 'react'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch,
} from 'firebase/firestore'
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from './firebase'

export function useCollection(name) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, name), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setItems(docs)
      setLoading(false)
    })
    return unsub
  }, [name])

  async function addItem(item) {
    const { id, ...data } = item
    await setDoc(doc(db, name, id), data)
  }

  async function removeItem(id) {
    await deleteDoc(doc(db, name, id))
  }

  async function updateItem(id, updates) {
    await setDoc(doc(db, name, id), updates, { merge: true })
  }

  return { items, loading, addItem, removeItem, updateItem }
}

export async function uploadPhoto(playerId, dataUrl) {
  const storageRef = ref(storage, `photos/${playerId}.jpg`)
  await uploadString(storageRef, dataUrl, 'data_url')
  return getDownloadURL(storageRef)
}

export async function deletePhoto(playerId) {
  try {
    const storageRef = ref(storage, `photos/${playerId}.jpg`)
    await deleteObject(storageRef)
  } catch {}
}
