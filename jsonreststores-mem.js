/*
Copyright (C) 2016 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const firstBy = require('thenby')

const Mixin = (superclass) => class extends superclass {
  // op can be 'fetch', 'update', 'insert', 'query', 'delete'.
  // If 'query, then data is an array. Otherwise, it's a record
  async transformResult (request, data, op) { }

  static get data () { return [] } // Data. This can get re-set to something else in children


  constructor () {
    super()
    this.data = this.constructor.data
  }

  reposition (currentPos) {
    //
    // No positioning managed: exit right away
    if (!this.positioning) return

    const record = this.data[currentPos]

    const beforeId = record[this.beforeIdField]

    // No beforeId defined: will leave it where it is
    if (typeof beforeId === 'undefined') return

    // The current position is last and beforeId is null: it's already where it
    // should be (last)
    if (currentPos === this.data.length - 1 && beforeId === null) return

    const newPos = this.data.findIndex(el => el[this.idProperty] === beforeId)
    if (newPos === -1) return
    this.data.splice(newPos, 0, this.data.splice(currentPos, 1)[0])
    return newPos
  }

  // Input:
  // - request.body
  // Output: an object (saved record)

  async implementInsert (request) {
    await super.implementInsert(request)

    request.record = request.body
    if (typeof request.record[this.idProperty] === 'undefined') {
      request.record[this.idProperty] = Math.max(this.data.map(el => el[this.idProperty])) + 1
    } else {
      if (this.data.findIndex(el => el[this.idProperty] === request.record[this.idProperty]) !== -1) {
        throw new Error('ID already present, cannot insert duplicate IDs')
      }
    }

    this.data.push(request.record)
    // if (this.positioning) request.record[this.positionField] = this.reposition(this.data.length - 1)
    if (this.positioning) this.reposition(this.data.length - 1)

    return this.transformResult(request, request.record, 'insert')
  }

  // Input:
  // - request.params (query)
  // - request.body (data)
  // Output: an object (updated record, refetched)
  //
  async implementUpdate (request) {
    await super.implementUpdate(request)

    const currentPos = this.data.findIndex(el => el[this.idProperty] === request.record[this.idProperty])
    this.data[currentPos] = request.record
    // if (this.positioning) request.record[this.positionField] = this.reposition(currentPos)
    if (this.positioning) this.reposition(currentPos)

    return this.transformResult(request, request.record, 'update')
  }

  // Input: request.params (with key this.idProperty set)
  // Output: nothing
  async implementDelete (request) {
    await super.implementDelete(request)

    const currentPos = this.data.findIndex(el => el[this.idProperty] === request.record[this.idProperty])
    this.data.splice(currentPos, 1)

    return this.transformResult(request, request.record, 'delete')

  }

  // Input: request.params, request.options.[conditionsHash,skip,limit,sort]
  // Output: { data: [], grandTotal: ? }
  async implementQuery (request) {
    await super.implementQuery(request)

    let retData = this.data

    if (Object.keys(request.options.conditionsHash).length) retData = await this.filterByConditions(request, retData)
    if (Object.keys(request.options.sort).length) retData = await this.sortBy(request, retData)

    if (request.options.skip) retData = retData.splice(request.options.skip, 0)
    if (request.options.limit) retData = retData.slice(0, request.options.limit)

    const transformedData = [ ...retData ]
    await this.transformResult(request, transformedData, 'query')

    return { data: transformedData, grandTotal: retData.length }
  }

  async filterByConditions (request, d) {
    const ch = request.options.conditionsHash

    return d.filter(item => {
      for (const key in ch) {
        if (typeof item[key] === 'undefined' || item[key] !== ch[key]) return false
      }
      return true
    })
  }

  async sortBy (request, d) {
    const sortFields = request.options.sort
    const sortKeys = Object.keys(sortFields)
    const sortConditions = firstBy()
    for (let i = 1, l = sortKeys.length; i < l; i++) {
      sortConditions.thenBy(sortFields[i], { ignoreCase: true, direction: sortFields[i] === 1 })
    }
    return d.sort(sortConditions)
  }

  // Input: request.params (with key this.idProperty set)
  // Output: an object
  async implementFetch (request) {
    await super.implementFetch(request)

    const currentPos = this.data.findIndex(el => el[this.idProperty] === request.params[this.idProperty])

    request.record = this.data[currentPos]

    // Requested by the API: when implementing implementFetch(), this function
    // must be called when request.record is set
    if (request.record) this.implementFetchPermissions(request)

    this.transformResult(request, request.record, 'fetch')
    return request.record
  }
}

exports = module.exports = Mixin
