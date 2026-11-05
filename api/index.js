import  dotenv from "dotenv";
 import  express from "express"; 
import { connectedDB } from "./config/db.js"
 import { stkPush } from "./mpesa/STKpush.js";
import { savePending, getTransaction, handleCallback } from "./mpesa/callbackUrl.js";
 
 dotenv.config();
  
const app = express(); 
 app.use(express.json());
app.post("/api/mpesa/stkpush" , async (req,res) =>{
   try{
    const  {phone ,amount} = req.body 
    if(!phone || !amount) { 
         return res.status(400).json({message:"Phone and amount are required"})
    }
     const  data =  await  stkPush({phone,amount})
      savePending(data.CheckoutRequestID, { phone, amount });
res.json({message:"STK push initiated", data})
    }  catch (error) { 
     res.status(500).json({message:"Internal server error"})
   }
}) 
app.post("/api/mpesa/callback" , (req,res) => {
    try{
         console.log("CALLBACK RECEIVED", JSON.stringify(handleCallback(req.body), null, 2));
    }
    catch (error) {
         console.error("Error handling callback:", error);

    }
})
app.get("/api/mpesa/status/:id", (req, res) => {
  res.json(getTransaction(req.params.id) || { status: "NOT_FOUND" });
});
  const  PORT  = process.env.PORT || 5000;
 const  start  =  async () => {
     await connectedDB(process.env.MONGO_URI);
     app.listen(PORT, () => {
         console.log(`Server is running on port ${PORT}`);
     });
 }
 
  start() 
   