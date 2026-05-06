import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDlWqr25qOEW3hPMsZesD7TyEDYaPKcCHE",
  authDomain: "urban-homestay.firebaseapp.com",
  databaseURL: "https://urban-homestay-default-rtdb.firebaseio.com",
  projectId: "urban-homestay",
  storageBucket: "urban-homestay.firebasestorage.app",
  messagingSenderId: "318531746642",
  appId: "1:318531746642:web:1f8c7b8bcceee9d809988b",
  measurementId: "G-2DT9GVG07K"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
