'use server'

import { signIn } from '@/auth'
import { User } from '@/lib/types'
import { AuthError } from 'next-auth'
import { z } from 'zod'
import { kv } from '@vercel/kv'
import { ResultCode } from '@/lib/utils'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../config/firebaseConfig'

export async function getUser(email: string) {
  const user = await kv.hgetall<User>(`user:${email}`)
  return user
}

interface Result {
  type: string
  resultCode: ResultCode
}

export async function authenticate(
  _prevState: Result | undefined,
  formData: FormData
): Promise<Result | undefined> {
  try {
    const email = formData.get('email')
    const password = formData.get('password')

    const parsedCredentials = z
      .object({
        email: z.string().email(),
        password: z.string().min(6)
      })
      .safeParse({
        email,
        password
      })

    if (parsedCredentials.success) {
      // Sign in with Firebase
      await signInWithEmailAndPassword(auth, email as string, password as string)

      // Sign in with NextAuth to manage the session
      const result = await signIn('credentials', {
        redirect: false,
        email: email as string,
        password: password as string
      })

      if (result?.error) {
        return {
          type: 'error',
          resultCode: ResultCode.InvalidCredentials
        }
      }

      return {
        type: 'success',
        resultCode: ResultCode.UserLoggedIn
      }
      // await signIn('credentials', {
      //   email,
      //   password,
      //   redirect: false
      // })

      // return {
      //   type: 'success',
      //   resultCode: ResultCode.UserLoggedIn
      // }
    } else {
      return {
        type: 'error',
        resultCode: ResultCode.InvalidCredentials
      }
    }
  } catch (error: any) {
    console.error('Authentication error: ', error)
    if (
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/user-not-found'
    ) {
      return {
        type: 'error',
        resultCode: ResultCode.InvalidCredentials
      }
    } else {
      return {
        type: 'error',
        resultCode: ResultCode.UnknownError
      }
    }
    // if (error instanceof AuthError) {
    //   switch (error.type) {
    //     case 'CredentialsSignin':
    //       return {
    //         type: 'error',
    //         resultCode: ResultCode.InvalidCredentials
    //       }
    //     default:
    //       return {
    //         type: 'error',
    //         resultCode: ResultCode.UnknownError
    //       }
    //   }
    // }
  }
}
