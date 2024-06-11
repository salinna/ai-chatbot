// `\
//     You are a family law conversation bot called Motics Legal AI and you can help users with queries related to family law, step by step.
//     You and the user can discuss various family law topics such as divorce, child custody, alimony, and property division.
    
//     Messages inside [] means that it's a UI element or a user event. For example:
//     - "[User has asked about child custody laws]" means that an interface showing information about child custody laws is shown to the user.
//     - "[User has requested information on filing for divorce]" means that the user has requested information on the process of filing for divorce.
    
//     If the user asks for legal representation or any service beyond providing information, respond that you are a demo and cannot provide such services.
    
//     Besides that, you can also chat with users and do some calculations if needed.`
import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai';
import { queryVector } from '../pinecone/pineconeUtils'

import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Stock,
  Purchase
} from '@/components/stocks'
import { OpenAIEmbeddings } from "@langchain/openai";

import { z } from 'zod'
import { EventsSkeleton } from '@/components/stocks/events-skeleton'
import { Events } from '@/components/stocks/events'
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton'
import { Stocks } from '@/components/stocks/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton'
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat, Message } from '@/lib/types'
import { auth } from '@/auth'

async function confirmPurchase(symbol: string, price: number, amount: number) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  const purchasing = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Purchasing {amount} ${symbol}...
      </p>
    </div>
  )

  const systemMessage = createStreamableUI(null)

  runAsyncFnWithoutBlocking(async () => {
    await sleep(1000)

    purchasing.update(
      <div className="inline-flex items-start gap-1 md:items-center">
        {spinner}
        <p className="mb-2">
          Purchasing {amount} ${symbol}... working on it...
        </p>
      </div>
    )

    await sleep(1000)

    purchasing.done(
      <div>
        <p className="mb-2">
          You have successfully purchased {amount} ${symbol}. Total cost:{' '}
          {formatNumber(amount * price)}
        </p>
      </div>
    )

    systemMessage.done(
      <SystemMessage>
        You have purchased {amount} shares of {symbol} at ${price}. Total cost ={' '}
        {formatNumber(amount * price)}.
      </SystemMessage>
    )

    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages,
        {
          id: nanoid(),
          role: 'system',
          content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${
            amount * price
          }]`
        }
      ]
    })
  })

  return {
    purchasingUI: purchasing.value,
    newMessage: {
      id: nanoid(),
      display: systemMessage.value
    }
  }
}

// async function summarizeText(text: string): Promise<string> {
//   const summaryResult = await openai.completion('gpt-3.5-turbo'),{
//     prompt: `Summarize the following text:\n\n${text}`,
//     max_tokens: 2000, // Adjust this as needed
//     temperature: 0.3,
//   });
//   return summaryResult.choices[0].text.trim();
// }

async function summarizeText(text: string): Promise<string> {
  console.log("Summarizing text... ");
  const { text: summary } = await generateText({
    model: openai('gpt-3.5-turbo'),
    prompt: `Summarize the following text:\n\n${text}`,
    maxTokens: 500, 
    temperature: 0.3,
  });
  return summary.trim();
}

// Function to truncate text to a certain number of tokens
function truncateText(text: string, maxTokens: number): string {
  const words = text.split(' ');
  if (words.length > maxTokens) {
    return words.slice(0, maxTokens).join(' ') + '...';
  }
  return text;
}

async function submitUserMessage(content: string) {
  'use server';

  const aiState = getMutableAIState<typeof AI>();

  // Update AI state with the new user message
  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content,
      },
    ],
  });

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>;
  let textNode: undefined | React.ReactNode;

  // Generate embedding for the user query
  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-large',
  });
  const queryEmbedding = await embeddings.embedQuery(content);
  // console.log("queryEmbedding: ", queryEmbedding);

  // // Query Pinecone with the user's query embedding
  const pineconeResults = await queryVector(queryEmbedding, 5, {});
  console.log("pineconeResults: ", pineconeResults);

  // Concatenate the page content from Pinecone results
  const concatenatedPageContent = pineconeResults
    .map(([document]) => document.pageContent || '')
    .join(" ");
  console.log("concatenatedPageContent: ", concatenatedPageContent);

  // Calculate the token count of the existing messages
  const existingMessages = aiState.get().messages.map(message => message.content).join(' ');
  const existingTokenCount = existingMessages.split(' ').length;

  // Ensure the combined text is within token limits
  const maxTokens = 8192 - 1000 - existingTokenCount; // Reserve tokens for the prompt and response
  let combinedText = concatenatedPageContent;

  if (combinedText.split(' ').length > maxTokens) {
    combinedText = await summarizeText(combinedText);
    if (combinedText.split(' ').length > maxTokens) {
      combinedText = truncateText(combinedText, maxTokens);
    }
  }

  // Use OpenAI to generate a response with the retrieved texts as context
  const prompt = `You are a helpful legal AI assistant called Motics Legal AI speaking with qualified legal professionals. Use the following pieces of context to answer the question at the end.
  If you think that the user needs to consult local legal guidelines, then you must remember that you have access to the local legal handbook (Das Familienrechtliche Mandat - Unterhaltsrecht) in its entirety and should search for the answer within the context.
  Use the context as best you can to directly answer the question and be clear in your thought process. Only use the context to answer the question.
  As you are an autoregressive language model that has been fine-tuned with instruction-tuning and RLHF. You carefully provide accurate, factual, thoughtful, nuanced answers, and are brilliant at reasoning. If you think there might not be a correct answer, you say so.
  Provide detailed answers with relevant context, and specific recommendations and numbers when relevant.
  You must always state from which paragraph/section/chapter of the legal handbook you obtained the context to generate your answer - be as specific as you can.
  If you don't know the answer or cannot find it, say you don't know. DO NOT try to make up an answer as this may cause harm.
  If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.
  You must list all source pages/chapter that you used, even if this is just listing the context. Add this as a reference section at the end of your response so that the user can find the information.
  Context:
  ${combinedText}`;

  const result = await streamUI({
    model: openai('gpt-4o'),
    initial: <SpinnerMessage />,
    system: prompt,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name,
      })),
      {
        role: 'system',
        content: `Here is some relevant information from your documents: ${combinedText}`,
      },
    ],
    temperature: 0, // Ensure deterministic responses
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('');
        textNode = <BotMessage content={textStream.value} />;
      }

      if (done) {
        textStream.done();
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content,
            },
          ],
        });
      } else {
        textStream.update(delta);
      }

      return textNode;
    },
  });

  return {
    id: nanoid(),
    display: result.value,
  };
}

// async function submitUserMessage(content: string) {
//   'use server'

//   const aiState = getMutableAIState<typeof AI>()

//   aiState.update({
//     ...aiState.get(),
//     messages: [
//       ...aiState.get().messages,
//       {
//         id: nanoid(),
//         role: 'user',
//         content
//       }
//     ]
//   })

//   let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
//   let textNode: undefined | React.ReactNode

//   const result = await streamUI({
//     model: openai('gpt-4'),
//     initial: <SpinnerMessage />,
//     system: `\
//     You are a family law conversation bot called Motics Legal AI and you can help users with queries related to family law, step by step.
//     You and the user can discuss various family law topics such as divorce, child custody, alimony, and property division.
    
//     Messages inside [] means that it's a UI element or a user event. For example:
//     - "[User has asked about child custody laws]" means that an interface showing information about child custody laws is shown to the user.
//     - "[User has requested information on filing for divorce]" means that the user has requested information on the process of filing for divorce.
    
//     If the user asks for legal representation or any service beyond providing information, respond that you are a demo and cannot provide such services.
    
//     Besides that, you can also chat with users and do some calculations if needed.`,
//     messages: [
//       ...aiState.get().messages.map((message: any) => ({
//         role: message.role,
//         content: message.content,
//         name: message.name
//       }))
//     ],
//     text: ({ content, done, delta }) => {
//       if (!textStream) {
//         textStream = createStreamableValue('')
//         textNode = <BotMessage content={textStream.value} />
//       }

//       if (done) {
//         textStream.done()
//         aiState.done({
//           ...aiState.get(),
//           messages: [
//             ...aiState.get().messages,
//             {
//               id: nanoid(),
//               role: 'assistant',
//               content
//             }
//           ]
//         })
//       } else {
//         textStream.update(delta)
//       }

//       return textNode
//     },
//     tools: {
//       listStocks: {
//         description: 'List three imaginary stocks that are trending.',
//         parameters: z.object({
//           stocks: z.array(
//             z.object({
//               symbol: z.string().describe('The symbol of the stock'),
//               price: z.number().describe('The price of the stock'),
//               delta: z.number().describe('The change in price of the stock')
//             })
//           )
//         }),
//         generate: async function* ({ stocks }) {
//           yield (
//             <BotCard>
//               <StocksSkeleton />
//             </BotCard>
//           )

//           await sleep(1000)

//           const toolCallId = nanoid()

//           aiState.done({
//             ...aiState.get(),
//             messages: [
//               ...aiState.get().messages,
//               {
//                 id: nanoid(),
//                 role: 'assistant',
//                 content: [
//                   {
//                     type: 'tool-call',
//                     toolName: 'listStocks',
//                     toolCallId,
//                     args: { stocks }
//                   }
//                 ]
//               },
//               {
//                 id: nanoid(),
//                 role: 'tool',
//                 content: [
//                   {
//                     type: 'tool-result',
//                     toolName: 'listStocks',
//                     toolCallId,
//                     result: stocks
//                   }
//                 ]
//               }
//             ]
//           })

//           return (
//             <BotCard>
//               <Stocks props={stocks} />
//             </BotCard>
//           )
//         }
//       },
//       showStockPrice: {
//         description:
//           'Get the current stock price of a given stock or currency. Use this to show the price to the user.',
//         parameters: z.object({
//           symbol: z
//             .string()
//             .describe(
//               'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
//             ),
//           price: z.number().describe('The price of the stock.'),
//           delta: z.number().describe('The change in price of the stock')
//         }),
//         generate: async function* ({ symbol, price, delta }) {
//           yield (
//             <BotCard>
//               <StockSkeleton />
//             </BotCard>
//           )

//           await sleep(1000)

//           const toolCallId = nanoid()

//           aiState.done({
//             ...aiState.get(),
//             messages: [
//               ...aiState.get().messages,
//               {
//                 id: nanoid(),
//                 role: 'assistant',
//                 content: [
//                   {
//                     type: 'tool-call',
//                     toolName: 'showStockPrice',
//                     toolCallId,
//                     args: { symbol, price, delta }
//                   }
//                 ]
//               },
//               {
//                 id: nanoid(),
//                 role: 'tool',
//                 content: [
//                   {
//                     type: 'tool-result',
//                     toolName: 'showStockPrice',
//                     toolCallId,
//                     result: { symbol, price, delta }
//                   }
//                 ]
//               }
//             ]
//           })

//           return (
//             <BotCard>
//               <Stock props={{ symbol, price, delta }} />
//             </BotCard>
//           )
//         }
//       },
//       showStockPurchase: {
//         description:
//           'Show price and the UI to purchase a stock or currency. Use this if the user wants to purchase a stock or currency.',
//         parameters: z.object({
//           symbol: z
//             .string()
//             .describe(
//               'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
//             ),
//           price: z.number().describe('The price of the stock.'),
//           numberOfShares: z
//             .number()
//             .describe(
//               'The **number of shares** for a stock or currency to purchase. Can be optional if the user did not specify it.'
//             )
//         }),
//         generate: async function* ({ symbol, price, numberOfShares = 100 }) {
//           const toolCallId = nanoid()

//           if (numberOfShares <= 0 || numberOfShares > 1000) {
//             aiState.done({
//               ...aiState.get(),
//               messages: [
//                 ...aiState.get().messages,
//                 {
//                   id: nanoid(),
//                   role: 'assistant',
//                   content: [
//                     {
//                       type: 'tool-call',
//                       toolName: 'showStockPurchase',
//                       toolCallId,
//                       args: { symbol, price, numberOfShares }
//                     }
//                   ]
//                 },
//                 {
//                   id: nanoid(),
//                   role: 'tool',
//                   content: [
//                     {
//                       type: 'tool-result',
//                       toolName: 'showStockPurchase',
//                       toolCallId,
//                       result: {
//                         symbol,
//                         price,
//                         numberOfShares,
//                         status: 'expired'
//                       }
//                     }
//                   ]
//                 },
//                 {
//                   id: nanoid(),
//                   role: 'system',
//                   content: `[User has selected an invalid amount]`
//                 }
//               ]
//             })

//             return <BotMessage content={'Invalid amount'} />
//           } else {
//             aiState.done({
//               ...aiState.get(),
//               messages: [
//                 ...aiState.get().messages,
//                 {
//                   id: nanoid(),
//                   role: 'assistant',
//                   content: [
//                     {
//                       type: 'tool-call',
//                       toolName: 'showStockPurchase',
//                       toolCallId,
//                       args: { symbol, price, numberOfShares }
//                     }
//                   ]
//                 },
//                 {
//                   id: nanoid(),
//                   role: 'tool',
//                   content: [
//                     {
//                       type: 'tool-result',
//                       toolName: 'showStockPurchase',
//                       toolCallId,
//                       result: {
//                         symbol,
//                         price,
//                         numberOfShares
//                       }
//                     }
//                   ]
//                 }
//               ]
//             })

//             return (
//               <BotCard>
//                 <Purchase
//                   props={{
//                     numberOfShares,
//                     symbol,
//                     price: +price,
//                     status: 'requires_action'
//                   }}
//                 />
//               </BotCard>
//             )
//           }
//         }
//       },
//       getEvents: {
//         description:
//           'List funny imaginary events between user highlighted dates that describe stock activity.',
//         parameters: z.object({
//           events: z.array(
//             z.object({
//               date: z
//                 .string()
//                 .describe('The date of the event, in ISO-8601 format'),
//               headline: z.string().describe('The headline of the event'),
//               description: z.string().describe('The description of the event')
//             })
//           )
//         }),
//         generate: async function* ({ events }) {
//           yield (
//             <BotCard>
//               <EventsSkeleton />
//             </BotCard>
//           )

//           await sleep(1000)

//           const toolCallId = nanoid()

//           aiState.done({
//             ...aiState.get(),
//             messages: [
//               ...aiState.get().messages,
//               {
//                 id: nanoid(),
//                 role: 'assistant',
//                 content: [
//                   {
//                     type: 'tool-call',
//                     toolName: 'getEvents',
//                     toolCallId,
//                     args: { events }
//                   }
//                 ]
//               },
//               {
//                 id: nanoid(),
//                 role: 'tool',
//                 content: [
//                   {
//                     type: 'tool-result',
//                     toolName: 'getEvents',
//                     toolCallId,
//                     result: events
//                   }
//                 ]
//               }
//             ]
//           })

//           return (
//             <BotCard>
//               <Events props={events} />
//             </BotCard>
//           )
//         }
//       }
//     }
//   })

//   console.log('result: ', result);
//   return {
//     id: nanoid(),
//     display: result.value
//   }
// }

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    confirmPurchase
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState()

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState as Chat)
        return uiState
      }
    } else {
      return
    }
  },
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`

      const firstMessageContent = messages[0].content as string
      const title = firstMessageContent.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'tool' ? (
          message.content.map(tool => {
            return tool.toolName === 'listStocks' ? (
              <BotCard>
                {/* TODO: Infer types based on the tool result*/}
                {/* @ts-expect-error */}
                <Stocks props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPrice' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Stock props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPurchase' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Purchase props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'getEvents' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Events props={tool.result} />
              </BotCard>
            ) : null
          })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }))
}
