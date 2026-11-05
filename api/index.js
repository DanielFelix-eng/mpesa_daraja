import  dotenv from "dotenv";
 import  express from "express"; 
import { connectedDB } from "./config/db.js"
 dotenv.config();
const app = express(); 
const  PORT  = process.env.PORT || 3000;
 const  start  =  async () => {
     await connectedDB(process.env.MONGO_URI);
     app.listen(PORT, () => {
         console.log(`Server is running on port ${PORT}`);
     });
 }
 
  start()
   