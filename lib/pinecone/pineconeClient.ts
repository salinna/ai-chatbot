import { Pinecone } from "@pinecone-database/pinecone";

// Define the environment variables
const PINECONE_API_KEY = '45c9eb84-b3c6-4041-92d1-25d0795d2f36';
// const PINECONE_ENVIRONMENT = 'eu-west1-gcp';
const PINECONE_INDEX = 'motics-legal';

// Function to initialize Pinecone client
export async function initializePinecone() {
  const pinecone = new Pinecone({
    apiKey: PINECONE_API_KEY,
  });
  // const indexes = await pinecone.listIndexes();
  // console.log(indexes);
  const pineconeIndex = pinecone.index(PINECONE_INDEX);
  return pineconeIndex;
}

// import { PineconeClient } from 'pinecone-client';

// const PINECONE_API_KEY = 'your-api-key';
// const PINECONE_INDEX = 'your-index-name';

// export function initializePinecone() {
//   const pinecone = new PineconeClient({
//     environment: "your-environment", // e.g., "us-west1-gcp"
//     apiKey: PINECONE_API_KEY
//   });

//   return pinecone.Index(PINECONE_INDEX);
// }
