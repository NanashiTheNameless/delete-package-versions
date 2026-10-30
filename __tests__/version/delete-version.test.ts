import {http, HttpResponse} from 'msw'
import {setupServer} from 'msw/node'
import {deletePackageVersion, deletePackageVersions} from '../../src/version'

describe('delete tests - mock rest', () => {
  let server = setupServer()

  beforeEach(() => {
    server = setupServer()
    server.listen()
  })

  afterEach(() => {
    server.close()
  })

  it('deletePackageVersion', done => {
    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/123',
        () => {
          return new HttpResponse(null, {status: 204})
        }
      )
    )

    deletePackageVersion(
      '123',
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    ).subscribe(result => {
      expect(result).toBe(true)
      done()
    })
  })

  it('deletePackageVersions', done => {
    let success = 0

    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/*',
        () => {
          return new HttpResponse(null, {status: 204})
        }
      )
    )

    deletePackageVersions(
      ['123', '456', '789'],
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    )
      .subscribe(
        result => {
          expect(result).toBe(true)
          success++
        },
        err => {
          // should not get here
          done(err)
        }
      )
      .add(() => {
        expect(success).toBe(3)
        done()
      })
  })

  it('deletePackageVersions - GHES', done => {
    process.env.GITHUB_API_URL = 'https://github.someghesinstance.com/api/v3'

    let success = 0

    server.use(
      http.delete(
        'https://github.someghesinstance.com/api/v3/users/test-owner/packages/npm/test-package/versions/*',
        () => {
          return new HttpResponse(null, {status: 204})
        }
      )
    )

    deletePackageVersions(
      ['123', '456', '789'],
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    )
      .subscribe(
        result => {
          expect(result).toBe(true)
          success++
        },
        err => {
          // should not get here
          done(err)
        }
      )
      .add(() => {
        expect(success).toBe(3)

        delete process.env.GITHUB_API_URL
        done()
      })
  })

  it('deletePackageVersion - API error', done => {
    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/123',
        () => {
          return new HttpResponse(null, {status: 500})
        }
      )
    )

    deletePackageVersion(
      '123',
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    ).subscribe(
      () => {
        done(new Error('should not get here.'))
      },
      err => {
        expect(err).toContain('delete version API failed.')
        done()
      }
    )
  })

  it('deletePackageVersions - API error for some versions', done => {
    let success = 0
    let failed = 0

    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/:versionId',
        ({params}) => {
          if (params.versionId === '456') {
            return new HttpResponse(null, {status: 500})
          }
          return new HttpResponse(null, {status: 204})
        }
      )
    )

    deletePackageVersions(
      ['123', '456', '789'],
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    )
      .subscribe(
        result => {
          expect(result).toBe(true)
          success++
        },
        err => {
          expect(err).toContain('delete version API failed.')
          failed++
        }
      )
      .add(() => {
        expect(success).toBe(2)
        expect(failed).toBe(1)
        done()
      })
  })
  it('deletePackageVersion - error includes status for empty body', done => {
    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/123',
        () => {
          return new HttpResponse('', {
            status: 409,
            headers: {'x-github-request-id': 'ABC:123'}
          })
        }
      )
    )

    deletePackageVersion(
      '123',
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    ).subscribe(
      () => {
        done(new Error('should not get here.'))
      },
      err => {
        expect(err).toContain('delete version API failed.')
        expect(err).toContain('Version id 123')
        expect(err).toContain('(empty response body)')
        expect(err).toContain('status: 409')
        expect(err).toContain('request id: ABC:123')
        done()
      }
    )
  })

  it('deletePackageVersions - deletes sequentially', done => {
    let inFlight = 0
    let maxInFlight = 0
    const order: string[] = []

    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/:versionId',
        async ({params}) => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          order.push(params.versionId as string)
          await new Promise(resolve => setTimeout(resolve, 10))
          inFlight--
          return new HttpResponse(null, {status: 204})
        }
      )
    )

    deletePackageVersions(
      ['123', '456', '789'],
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    ).subscribe({
      error: err => done(err),
      complete: () => {
        expect(maxInFlight).toBe(1)
        expect(order).toEqual(['123', '456', '789'])
        done()
      }
    })
  })

  it('deletePackageVersions - versions already gone are skipped', done => {
    const results: boolean[] = []

    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/:versionId',
        ({params}) => {
          if (params.versionId === '456') {
            return HttpResponse.json(
              {message: 'Package version not found'},
              {status: 404}
            )
          }
          return new HttpResponse(null, {status: 204})
        }
      )
    )

    deletePackageVersions(
      ['123', '456', '789'],
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    ).subscribe({
      next: result => results.push(result),
      error: err => done(err),
      complete: () => {
        expect(results).toEqual([true, false, true])
        done()
      }
    })
  })

  it('deletePackageVersions - fails when no version is found', done => {
    server.use(
      http.delete(
        'https://api.github.com/users/test-owner/packages/npm/test-package/versions/*',
        () => {
          return HttpResponse.json(
            {message: 'Package not found'},
            {status: 404}
          )
        }
      )
    )

    deletePackageVersions(
      ['123', '456'],
      'test-owner',
      'test-package',
      'npm',
      'test-token'
    ).subscribe({
      error: err => {
        expect(err).toContain('None of the 2 versions could be found')
        done()
      },
      complete: () => done(new Error('should not complete'))
    })
  })
})
