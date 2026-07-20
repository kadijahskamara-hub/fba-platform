import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAudience, isInternalRole, postgrestEmailList, INTERNAL_ROLES,
} from '../lib/contactAudience'

// ============================================================
// Contacts audience split (Sprint 23)
// ============================================================

test('parseAudience defaults to crm', () => {
  assert.equal(parseAudience(null), 'crm')
  assert.equal(parseAudience(undefined), 'crm')
  assert.equal(parseAudience(''), 'crm')
  assert.equal(parseAudience('bogus'), 'crm')
  assert.equal(parseAudience('crm'), 'crm')
})

test('parseAudience recognises internal', () => {
  assert.equal(parseAudience('internal'), 'internal')
})

test('isInternalRole covers exactly admin and staff', () => {
  assert.equal(isInternalRole('admin'), true)
  assert.equal(isInternalRole('staff'), true)
  assert.equal(isInternalRole('trade_user'), false)
  assert.equal(isInternalRole('retail_customer'), false)
  assert.equal(isInternalRole(null), false)
  assert.equal(isInternalRole(undefined), false)
  assert.deepEqual([...INTERNAL_ROLES], ['admin', 'staff'])
})

test('postgrestEmailList returns null when nothing to exclude', () => {
  assert.equal(postgrestEmailList([]), null)
  assert.equal(postgrestEmailList(['', '  ']), null)
})

test('postgrestEmailList quotes, lowercases, trims and dedupes', () => {
  assert.equal(
    postgrestEmailList([' A@B.com', 'a@b.com', 'c@d.co.uk']),
    '("a@b.com","c@d.co.uk")'
  )
})

test('postgrestEmailList escapes embedded quotes and backslashes', () => {
  assert.equal(postgrestEmailList(['x"y@z.com']), '("x\\"y@z.com")')
  assert.equal(postgrestEmailList(['x\\y@z.com']), '("x\\\\y@z.com")')
})
