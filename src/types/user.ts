export type UserRole =
  | 'receiver'
  | 'officer'
  | 'case_owner'
  | 'supervisor'
  | 'director'
  | 'deputy_secretary'
  | 'secretary'
  | 'committee'
  | 'protection'
  | 'got_receiver'
  | 'got_director'
  | 'got_officer'
  | 'appeal'
  | 'admin'

export interface OrgUnit {
  id: string
  name: string
  parentId?: string
  isCentral?: boolean
}

export interface EcmisUser {
  id: string
  name: string
  position: string
  unit: string
  orgUnitId: string
  roles: string[]
  active: boolean
}

export interface RoleAssignment {
  units: string[]
  central?: boolean
}
