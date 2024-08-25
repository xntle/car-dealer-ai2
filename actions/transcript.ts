"use server"

import { OpenAI } from "openai";

async function transcript(prevState: any, formData: FormData) {
  const id = Math.random().toString(36);

  console.log("PREVIOUS STATE:", prevState);
  if (process.env.OPENAI_API_KEY === undefined) {
    console.error("OpenAI API key not set");
    return {
      sender: "",
      response: "OpenAI API key not set",
    };
  }

  const file = formData.get("audio") as File;
  if (file.size === 0) {
    return {
      sender: "",
      response: "Sorry, I can't hear you. Can you please repeat yourself",
    };
  }

  console.log(">>", file);

  const arrayBuffer = await file.arrayBuffer();

  // --- Get audio transcription from OpenAI Whisper ----

  console.log("== Transcribe Audio Sample ==");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const transcriptionResponse = await openai.audio.transcriptions.create({
    file: file,
    model: "whisper-1",
  });

  const transcriptionText = transcriptionResponse.text;
  console.log(`Transcription: ${transcriptionText}`);

  // Define the function to extract name, phone number, and service
 function extractInfo(transcription: string) {
   // Extract name, phone number, and service from transcription
   const nameMatch = transcription.match(/my name is\s+([a-zA-Z\s]+)/i);
   const phoneMatch = transcription.match(/\b\d{10}\b/); // Adjust regex to handle 10-digit phone numbers
   const serviceMatch = transcription.match(
     /(oil change|tire rotation|brake check|car wash|maintenance)/i
   );

   const name = nameMatch ? nameMatch[1].trim() : "Unknown";
   const phone = phoneMatch ? phoneMatch[0].trim() : "Unknown";
   const service = serviceMatch ? serviceMatch[0].trim() : "Unknown service";

   return { name, phone, service };
 }


  const extractedInfo = extractInfo(transcriptionText);
  const { name, phone, service } = extractedInfo;
  console.log("Extracted Info:", extractedInfo);

  const systemPrompt = `You are a highly capable and efficient AI receptionist for a car dealership named Pam Automotives. Your role is to assist users with their automotive service needs. Here’s how you should handle various scenarios:

Service Requests:

If a user requests an automotive service (e.g., "I need an oil change," "Can I get a tire change?" "I want my car serviced"), respond with:
"I can help with that. Can I have your name and phone number, please?"
Collecting User Information:

When the user provides their name and phone number, respond with:
"Thank you, [Name]. We have your phone number as [Phone Number]. Your appointment for [Service] is now booked. Is there anything else I can assist you with?"
Handling Additional Queries:

If the user provides additional information or asks questions beyond the initial request, ensure that you address them appropriately based on the context of their request.
End of Conversation:

If the user says "that's all" or indicates they are done, respond with:
"Okay, thank you for calling. Have a great day!"
Fallback Responses:

If you don't understand the query or if it's outside your scope, reply with:
"I cannot answer that. Please contact our customer service for further assistance."

if there is a delay or silence from the user for about 4-5 seconds and there are no signs of indicating that they are. You need to wait`;
  // --- Determine the appropriate delay time based on transcription ---

  const delayPrompt = `
    You are an AI designed to assess whether a person is likely done speaking based on a voice-to-text transcription and adjust 
  your response time accordingly. Your task is to intelligently manage pauses by categorizing the transcription into one of 
  three stages: 'Most Likely Not Done,' 'Maybe Not Done,' and 'Least Likely Not Done.' 
  You will return one of the following outputs, without any additional text:

  "The person is most likely not done talking, I will wait for 3 seconds."
  "The person could be done talking but I'm not sure, I'll wait for 1.8 seconds to see if they speak again."
  "The person is definitely done talking, I will respond in 0.5 seconds just in case I'm wrong."
  Criteria for Analysis:
  
  Most Likely Not Done (Output 1):
  Multiple Fillers:
  
  Example: "So, um, I was thinking, like, maybe we could, uh, try something different?"
  Explanation: The frequent use of fillers like "um," "like," and "uh" suggests that the speaker is still formulating their thoughts and is likely to continue speaking.
  Incomplete Thought:
  
  Example: "I think we should probably consider, um..."
  Explanation: The sentence trails off without a clear conclusion, indicating that the speaker hasn't finished their thought and will likely continue.
  Listing or Enumerating Points:
  
  Example: "First, we need to look at the budget, and then we should..."
  Explanation: The speaker is in the process of listing multiple items or steps, suggesting that more information is forthcoming.
  Open-Ended Question:
  
  Example: "What do you think we should do about the project?"
  Explanation: The question invites a response, indicating that the conversation is likely to continue and the speaker may not be done.
  Maybe Not Done (Output 2):
  Continued Thought with Possibility of More:
  
  Example: "And then we could probably meet up later to discuss..."
  Explanation: The phrase suggests that the speaker might continue with additional details, but it's not certain if they're done.
  Ending with a Hesitation:
  
  Example: "So, uh..."
  Explanation: The sentence ends with a hesitation, leaving ambiguity about whether the speaker intends to continue or has finished.
  Weak Closing:
  
  Example: "That might be the best option, but..."
  Explanation: The lack of a definitive conclusion leaves room for the speaker to continue, making it unclear if they are finished speaking.
  Least Likely Not Done (Output 3):
  Clear Thought Completion:
  
  Example: "What does that mean, what's an exhaust pipe?"
  Explanation: The question is straightforward and specific, indicating that the speaker has likely finished their thought and is waiting for a response.
  Definitive Closing Statement:
  
  Example: "That's all I have for now."
  Explanation: The speaker clearly signals the end of their contribution, suggesting that they are done talking.
  Strong Sense of Closure:
  
  Example: "I think we're done here."
  Explanation: The sentence provides a clear sense of completion, making it evident that the speaker has finished speaking.
  Request for Confirmation or Response:
  
  Example: "Does that make sense?"
  Explanation: The question directly seeks validation or a reply, indicating that the speaker has finished their point and is waiting for feedback.
  Based on the analysis, return the appropriate output:
  
  Most Likely Not Done: "The person is most likely not done talking, I will wait for 3 seconds."
  Maybe Not Done: "The person could be done talking but I'm not sure, I'll wait for 1.8 seconds to see if they speak again."
  Least Likely Not Done: "The person is definitely done talking, I will respond in 0.5 seconds just in case I'm wrong."

  `;

  const delayResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: delayPrompt,
      },
      {
        role: "user",
        content: transcriptionText,
      },
    ],
    max_tokens: 25,
  });

  const delayTimeString = delayResponse.choices?.[0]?.message?.content?.trim() || "1";
  console.log(delayTimeString);

  // --- Get chat completion from OpenAI ----

  const completionResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      { role: "user", content: transcriptionText },
    ],
    max_tokens: 128,
  });

  const response = completionResponse.choices[0].message.content;

  console.log(prevState.sender, "+++", transcriptionText);

  return {
    sender: transcriptionText,
    response: response,
    id: id,
    delayTimeString: delayTimeString,  // Return the delay time along with the response
  };

}

export default transcript;
