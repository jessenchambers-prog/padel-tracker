import { useState, useEffect } from 'react'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

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

