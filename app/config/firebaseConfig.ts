import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyChTaLcrzpNOfO9JLTBDu2DnA5BGsFzqvY',
  authDomain: 'motics-legal-ai.firebaseapp.com',
  projectId: 'motics-legal-ai',
  storageBucket: 'motics-legal-ai.appspot.com',
  messagingSenderId: '822715242904',
  appId: '1:822715242904:web:19122f9c444aed55c0f3ed',
  measurementId: 'G-305NWC1D6P'
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

export { app, auth }
