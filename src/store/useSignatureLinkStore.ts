import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { generateToken } from '../lib/utils'
import { Kb6SignerRole, OutgoingNoticeFormNo } from '../types/case'

/** Where a signing link's result should be applied once the external signer confirms. */
export type SignatureLinkTarget =
  | { kind: 'formDraft'; key: string }
  | { kind: 'kb1Case'; caseNo: string }
  | { kind: 'kb6'; caseNo: string; role: Kb6SignerRole }
  | { kind: 'outgoingNotice'; caseNo: string; formNo: OutgoingNoticeFormNo }

export interface SignatureLinkRequest {
  token: string
  title: string
  signerRole: string
  defaultSignerName: string
  target: SignatureLinkTarget
  status: 'pending' | 'signed'
  createdAt: string
  signedAt?: string
  signerName?: string
  signatureImage?: string
}

interface SignatureLinkState {
  links: Record<string, SignatureLinkRequest>
  createLink: (input: Pick<SignatureLinkRequest, 'title' | 'signerRole' | 'defaultSignerName' | 'target'>) => string
  completeLink: (token: string, signerName: string, signatureImage?: string) => void
}

export const useSignatureLinkStore = create<SignatureLinkState>()(
  persist(
    (set) => ({
      links: {},

      createLink: (input) => {
        const token = generateToken()
        const request: SignatureLinkRequest = {
          ...input,
          token,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ links: { ...state.links, [token]: request } }))
        return token
      },

      completeLink: (token, signerName, signatureImage) => {
        set((state) => {
          const existing = state.links[token]
          if (!existing) return state
          return {
            links: {
              ...state.links,
              [token]: {
                ...existing,
                status: 'signed',
                signerName,
                signatureImage,
                signedAt: new Date().toISOString(),
              },
            },
          }
        })
      },
    }),
    { name: 'ecmis-signature-link-storage-v1' }
  )
)
