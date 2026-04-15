import { db } from './firebase.js'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

// ─── PROJECTS ───────────────────────────────────────────────

/**
 * Subscribe to all projects, ordered by creation date (newest first).
 * Returns an unsubscribe function.
 */
export function subscribeToProjects(callback) {
  const q = query(
    collection(db, 'projects'),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snapshot => {
    const projects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(projects)
  })
}

/**
 * Get a single project by ID.
 */
export async function getProject(projectId) {
  const snap = await getDoc(doc(db, 'projects', projectId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * Create a new project. Returns the new project ID.
 */
export async function createProject(data) {
  const ref = await addDoc(collection(db, 'projects'), {
    address: data.address,
    description: data.description || null,
    status: 'active',
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    createdAt: serverTimestamp()
  })
  return ref.id
}

/**
 * Update a project's fields.
 */
export async function updateProject(projectId, data) {
  await updateDoc(doc(db, 'projects', projectId), data)
}

// ─── TASKS (update) ─────────────────────────────────────────

/**
 * Get a single task by ID.
 */
export async function getTask(taskId) {
  const snap = await getDoc(doc(db, 'tasks', taskId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * Update a task's fields.
 */
export async function updateTask(taskId, data) {
  await updateDoc(doc(db, 'tasks', taskId), data)
}

/**
 * Create a single task for a project (name only, quick path).
 */
export async function createTask(projectId, name) {
  const ref = await addDoc(collection(db, 'tasks'), {
    projectId,
    name,
    description: null,
    estimatedHours: null,
    status: 'not started',
    createdAt: serverTimestamp()
  })
  return ref.id
}

/**
 * Create a task with full fields. Returns the new task ID.
 */
export async function addTask({ projectId, name, description, estimatedHours, status }) {
  const ref = await addDoc(collection(db, 'tasks'), {
    projectId,
    name,
    description: description || null,
    estimatedHours: estimatedHours ?? null,
    status: status || 'not started',
    createdAt: serverTimestamp()
  })
  return ref.id
}

// ─── TASKS ──────────────────────────────────────────────────

/**
 * Get all tasks for a project, ordered by creation.
 */
export async function getTasks(projectId) {
  const q = query(
    collection(db, 'tasks'),
    where('projectId', '==', projectId),
    orderBy('createdAt', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Subscribe to tasks for a project (real-time).
 * Returns an unsubscribe function.
 */
export function subscribeToTasks(projectId, callback) {
  const q = query(
    collection(db, 'tasks'),
    where('projectId', '==', projectId),
    orderBy('createdAt', 'asc')
  )
  return onSnapshot(q, snapshot => {
    const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(tasks)
  })
}

/**
 * Create multiple tasks for a project in a single batch write.
 */
export async function createTasks(projectId, tasks) {
  const batch = writeBatch(db)
  tasks.forEach(task => {
    const ref = doc(collection(db, 'tasks'))
    batch.set(ref, {
      projectId,
      name: task.name,
      estimatedHours: task.estimatedHours ?? null,
      status: 'not started',
      createdAt: serverTimestamp()
    })
  })
  await batch.commit()
}

// ─── LOGS ───────────────────────────────────────────────────

/**
 * Subscribe to logs for a project on a given date (YYYY-MM-DD).
 * Returns an unsubscribe function.
 */
export function subscribeToLogs(projectId, callback) {
  const q = query(
    collection(db, 'logs'),
    where('projectId', '==', projectId),
    orderBy('timestamp', 'desc')
  )
  return onSnapshot(q, snapshot => {
    const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(logs)
  })
}

/**
 * Subscribe to the N most recent logs across all projects, newest first.
 * Returns an unsubscribe function.
 */
export function subscribeToRecentLogs(limitCount, callback) {
  const q = query(
    collection(db, 'logs'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  )
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

/**
 * Subscribe to logs for a specific task (real-time), newest first.
 * Returns an unsubscribe function.
 */
export function subscribeToTaskLogs(taskId, callback) {
  // Single-field where clause only — no composite index required.
  // Client-side sort by timestamp descending.
  const q = query(
    collection(db, 'logs'),
    where('taskId', '==', taskId)
  )
  return onSnapshot(q, snapshot => {
    const logs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() ?? 0
        const tb = b.timestamp?.toMillis?.() ?? 0
        return tb - ta
      })
    callback(logs)
  })
}

/**
 * Add a log entry.
 */
export async function addLog(data) {
  const ref = await addDoc(collection(db, 'logs'), {
    projectId: data.projectId,
    taskId: data.taskId || null,
    type: data.type,
    photoUrl: data.photoUrl || null,
    note: data.note || null,
    location: data.location || null,
    timestamp: serverTimestamp()
  })
  return ref.id
}
