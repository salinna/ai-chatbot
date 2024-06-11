import { initializePinecone } from './pineconeClient'
import { OpenAIEmbeddings } from '@langchain/openai'
import { PineconeStore } from '@langchain/pinecone'

export async function upsertVector(id: string, vector: number[]) {
  const index = await initializePinecone()
  await index.upsert([{ id, values: vector }])
}

export async function queryVector(
  vector: number[],
  topK: number,
  filters: Record<string, any>
) {
  const pineconeIndex = await initializePinecone()
  const vectorStore = await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({ modelName: 'text-embedding-3-large' }),
    {
      pineconeIndex: pineconeIndex,
      textKey: 'text',
      namespace: 'motics-legal'
    }
  )

  // const vectorString = JSON.stringify(vector); // Convert vector to string
  const results = await vectorStore.similaritySearchVectorWithScore(
    vector,
    topK,
    filters
  )
  return results
}
