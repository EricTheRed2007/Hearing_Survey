const { createClient } = require('@supabase/supabase-js')
const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors())
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

app.post("/submit", async (req,res) => {

  const data = req.body

  console.log("Incoming submission:")
  console.log(JSON.stringify(req.body, null, 2))


  if(!data || !data.thresholds || !data.device_info){
    return res.status(400).json({error:"Invalid submission"})
  }

  const highFreqMean = (data.thresholds[4000] + data.thresholds[8000]) / 2;
  const highFreqLoss = highFreqMean - data.thresholds[500];

  const row = {

    created_at: new Date(),

    id: data.participant_id,

    age: data.age,
    headphone_hours: data.headphone_hours,
    years_using_headphones: data.years_using_headphones,

    threshold_500: data.thresholds[500],
    threshold_1000: data.thresholds[1000],
    threshold_4000: data.thresholds[4000],
    threshold_8000: data.thresholds[8000],

    high_freq_loss: highFreqLoss,

    user_agent: data.device_info.user_agent,
    platform: data.device_info.platform,
    sample_rate: data.device_info.sample_rate
  }

  const { error } = await supabase
    .from("hearing_tests")
    .insert([row])


  if(error){

    if(error.code === "23505"){
      return res.status(409).json({error:"Duplicate submission"})
    }

    console.error(error)
    return res.status(500).json({error:"Database error"})
  }

  res.json({status:"stored"})
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})