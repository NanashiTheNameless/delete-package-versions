/* eslint-disable i18n-text/no-en */

import {concat, defer, EMPTY, from, Observable, throwError, of} from 'rxjs'
import {catchError, concatMap, map, tap} from 'rxjs/operators'
import {Octokit} from '@octokit/rest'
import type {RestEndpointMethodTypes} from '@octokit/rest'

type PackageType =
  RestEndpointMethodTypes['packages']['getAllPackageVersionsForPackageOwnedByUser']['parameters']['package_type']

interface ApiError {
  status?: number
  message?: string
  errors?: Array<{message?: string}>
  response?: {headers?: Record<string, string | undefined>}
}

// Builds an error description that always carries the HTTP status and request id,
// since some registry failures come back with an empty body and no message.
function describeApiError(err: ApiError): string {
  const detail =
    err.errors && err.errors.length > 0 && err.errors[0].message
      ? err.errors[0].message
      : err.message || '(empty response body)'
  const parts = [detail]
  if (err.status) parts.push(`status: ${err.status}`)
  const requestId = err.response?.headers?.['x-github-request-id']
  if (requestId) parts.push(`request id: ${requestId}`)
  return parts.join(', ')
}

export function deletePackageVersion(
  packageVersionId: string,
  owner: string,
  packageName: string,
  packageType: string,
  token: string
): Observable<boolean> {
  const octokit = new Octokit({
    auth: token,
    baseUrl: process.env.GITHUB_API_URL || 'https://api.github.com'
  })
  const package_version_id = +packageVersionId
  const package_type: PackageType = packageType as PackageType

  return from(
    octokit.rest.packages.deletePackageVersionForUser({
      package_type,
      package_name: packageName,
      username: owner,
      package_version_id
    })
  ).pipe(
    map(response => response.status === 204),
    catchError((err: ApiError) => {
      // A version can disappear between listing and deleting, e.g. when deleting
      // a multi-arch image index also removes the manifests it references.
      if (err.status === 404) {
        console.log(
          `version with id: ${packageVersionId} not found, it may already be deleted (${describeApiError(err)})`
        )
        return of(false)
      }
      return throwError(
        `delete version API failed. Version id ${packageVersionId}: ${describeApiError(err)}`
      )
    })
  )
}

export function deletePackageVersions(
  packageVersionIds: string[],
  owner: string,
  packageName: string,
  packageType: string,
  token: string
): Observable<boolean> {
  if (packageVersionIds.length === 0) {
    return of(true)
  }

  let deleted = 0
  let notDeleted = 0
  const failures: string[] = []

  // Delete one version at a time so related versions (an image index and its
  // platform manifests) are never removed concurrently, and keep going after a
  // failure so one bad version does not block the rest.
  const deletes = from(packageVersionIds).pipe(
    concatMap(id =>
      deletePackageVersion(id, owner, packageName, packageType, token).pipe(
        tap(result => {
          if (result) {
            deleted += 1
          } else {
            notDeleted += 1
            console.log(`version with id: ${id}, not deleted`)
          }
        }),
        catchError(err => {
          failures.push(String(err))
          return EMPTY
        })
      )
    )
  )

  const summary = defer(() => {
    console.log(
      `Deleted ${deleted} of ${packageVersionIds.length} versions (${notDeleted} not found, ${failures.length} failed).`
    )
    if (failures.length > 0) {
      return throwError(
        `${failures.join('\n')}\n${deleted} of ${packageVersionIds.length} versions deleted.`
      )
    }
    if (deleted === 0) {
      return throwError(
        `None of the ${packageVersionIds.length} versions could be found. Check the package name, owner and token permissions.`
      )
    }
    return EMPTY
  })

  return concat(deletes, summary)
}
