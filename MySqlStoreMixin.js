/*
Copyright (C) 2016 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
var promisify = require('util').promisify

var MySqlStoreMixin = (superclass) => class extends superclass {
  constructor () {
    super()
    this.connection = this.constructor.connection
    this.connection.queryP = promisify(this.connection.query)
    this.table = this.constructor.table
  }

  static get connection () {
    return null
  }

  static get table () {
    return null
  }

  _checkVars () {
    if (!this.connection) throw new Error('The static property "connection" must be set')
    if (!this.table) throw new Error('The static property "table" must be set')
  }

  _selectFields (prefix) {
    var l = []

    // Always return isProperty
    l.push(`${prefix}${this.idProperty}`)

    // Return all fields from the schema that are not marked as "silent"
    for (var k in this.schema.structure) {
      if (!this.schema.structure[k].silent) l.push(`${prefix}${k}`)
    }

    // Link everything up, and that's it!
    return l.join(',')
  }

  // If a positionField is set, then delete body.beforeId -- before saving it
  // in this.data, so that it can be used for positioning
  async beforeValidate (request, method) {
    if (this.positionField) {
      request.beforeId = request.body[this.beforeIdField]
      delete request.body[this.beforeIdField]
    }

    return super.beforeValidate(request, method)
  }

  // Input: request.params
  // Output: an object
  async implementFetch (request) {
    this._checkVars()

    var fields = this._selectFields(`${this.table}.`)
    return (await this.connection.queryP(`SELECT ${fields} FROM ${this.table} WHERE ${this.table}.${this.idProperty} = ?`, request.params[this.idProperty]))[0]
  }


  _positionFiltersFieldsSame (request) {

    // If there is no original request.doc, there is nothing to check
    if (!request.doc) return true

    // Check whether the positionFilter fields have changed.
    // Note that it's a soft `!=` comparison since the way data is stored on the DB
    // might be different to what is passed. This assumes that DB and JS will have
    // compatible results
    for (let k of this.positionFilter) {
      if (typeof request.body[k] !== 'undefined' && typeof request.doc[k] !== 'undefined') {
        if (request.body[k] != request.doc[k]) return false
      }
    }
    return true
  }

  // Make sure the positionField is updated depending on beforeID passed:
  // undefined    => leave it where it was (if it had a position) or place it last (if it didn't have a position)
  // null         => place it last
  // number       => valid record   => place it before that record, "making space"
  //              => INvalid record => place it last
  async _calculatePosition (request) {

    // No position field: exit right away
    if (typeof this.positionField === 'undefined') return

    // This function will be called a lot in case the record is to be placed last.
    // It has side-effects (it changes request.body AND it changes the DB)
    var last = async () => {
      request.body[this.positionField] = (await this.connection.queryP(`SELECT max(${this.positionField}) as maxPosition FROM ${this.table} WHERE ${wherePositionFilter}`, positionQueryArgs))[0].maxPosition + 1
    }

    // Work really hard to find out what the previous position was
    // Note: request.doc might be empty even in case of update in case
    // of usage via API (implementUpdate() with dummy/incomplete request)
    var prevPosition
    if (request.doc) prevPosition = request.doc[this.positionField]
    else {
      if (request.params && typeof request.params[this.idProperty] !== 'undefined'){
        var r = (await this.connection.queryP(`SELECT ${this.positionField} FROM ${this.table} WHERE ${this.table}.${this.idProperty} = ?`, [ request.params[this.idProperty] ]))[0]
        if (r) prevPosition = r[this.positionField]
      }
    }

    var positionQueryArgs = []
    var wherePositionFilter
    if (this.positionFilter.length === 0) wherePositionFilter = '1 = 1'
    else {
      let source = request.doc || request.body
      let r = []
      for (let k of this.positionFilter) {
        if (source[k] === null || typeof source[k] === 'undefined') {
          r.push(`(${k} is NULL)`)
        } else {
          r.push(`(${k} = ?)`)
          positionQueryArgs.push(source[k])
        }
      }
      wherePositionFilter = ' ' + r.join(' AND ') + ' '
    }

    // If ANY of the positionFilters have changed, it will go
    // last, end of story (since "position 2" might mean something different)
    //
    // This is because generally proper repositioning will only happen with Drag&drop and
    // therefore changing positio fields would be strange.
    // On the other hand, if a field is soft-deleted, it will need to have its
    // place reset since its position makes no sense in the new "group"
    if (!this._positionFiltersFieldsSame(request) ){
      await last()
    }

    // undefined    => leave it where it was (if it had a position) or place it last (if it didn't have a position)
    else if (typeof request.beforeId === 'undefined') {
      if (! prevPosition) await last()
      else request.body[this.positionField] = prevPosition

    // null         => place it last
    } else if (request.beforeId === null) {
      await last()

    // number       => valid record   => place it before that record, overwriting previous position
    //                 Invalid record => place it last
    } else {
      var beforeIdItem = (await this.connection.queryP(`SELECT ${this.table}.${this.idProperty}, ${this.positionField} FROM ${this.table} WHERE ${this.table}.${this.idProperty} = ? AND ${wherePositionFilter}`, [ request.beforeId, ...positionQueryArgs ]))[0]

      // number       => valid record   => place it before that record, "making space"
      if (beforeIdItem) {
        await this.connection.queryP(`UPDATE ${this.table} SET ${this.positionField} = ${this.positionField} + 1 WHERE ${this.positionField} >= ?  AND ${wherePositionFilter} ORDER BY ${this.positionField} DESC`, [ beforeIdItem[this.positionField] || 0, ...positionQueryArgs ])
        request.body[this.positionField] = beforeIdItem[this.positionField]
      //              => INvalid record => place it last
      } else {
        await last()
      }
    }
  }

  // Input: request.body, request.options.[placement,placementAfter]
  // Output: an object (saved record)
  async implementInsert (request) {
    this._checkVars()

    await this._calculatePosition(request)

    // var fields = this._selectFields(`${this.table}.`)
    let insertResults = await this.connection.queryP(`INSERT INTO ${this.table} SET ?`, request.body)
    var bogusRequest = { session: request.session, params: { [this.idProperty]: insertResults.insertId } }
    return this.implementFetch(bogusRequest)
  }

  // Input:
  // - request.params (query)
  // - request.body (data)
  // - request.options.field (field name if it's a one-field update)
  // - request.options.[placement,placementAfter] (for record placement)
  // Output: an object (updated record)
  async implementUpdate (request) {
    this._checkVars()

    await this._calculatePosition(request)

    // var fields = this._selectFields(`${this.table}.`)
    await this.connection.queryP(`UPDATE ${this.table} SET ? WHERE ${this.idProperty} = ?`, [request.body, request.params[this.idProperty]])

    var bogusRequest = { session: request.session, params: { [this.idProperty]: request.params.id } }
    return this.implementFetch(bogusRequest)
    // return (await this.connection.queryP(`SELECT ${fields} FROM ${this.table} WHERE id = ?`, request.params.id))[0]
  }

  // Input: request.params
  // Output: an object (deleted record)
  async implementDelete (request) {
    this._checkVars()

    var fields = this._selectFields(`${this.table}.`)

    let record = (await this.connection.queryP(`SELECT ${fields} FROM ${this.table} WHERE ${this.idProperty} = ?`, request.params[this.idProperty]))[0]
    await this.connection.queryP(`DELETE FROM ${this.table} WHERE ${this.idProperty} = ?`, [request.params[this.idProperty]])
    return record
  }

  defaultConditions (request, args, whereStr, prefix = '') {
    var ch = request.options.conditionsHash
    for (let k in ch) {
      var kEscaped = `\`${k}\``
      // Add fields that are in the searchSchema
      if (this.searchSchema.structure[k] && this.schema.structure[k] && String(ch[k]) !== '') {
        if (ch[k] === null){
          whereStr = whereStr + ` AND ${prefix}${kEscaped} IS NULL`
         } else {
          args.push(ch[k])
          whereStr = whereStr + ` AND ${prefix}${kEscaped} = ?`
        }
      }
    }

    for (let k in request.params) {
      var kEscaped = `\`${k}\``
      if (this.schema.structure[k] && String(request.params[k]) !== '') {
        args.push(request.params[k])
        whereStr = whereStr + ` AND ${prefix}${kEscaped} = ?`
      }
    }

    return { args, whereStr }
  }

  makeSortString (sort = {}) {
    var sortStr = ''
    if (Object.keys(sort).length) {
      let l = []
      sortStr = ' ORDER BY '
      for (let k in sort) {
        l.push(k + ' ' + (Number(sort[k]) === 1 ? 'DESC' : 'ASC'))
      }
      sortStr = sortStr + l.join(',')
    }
    return sortStr
  }

  // Input: request.params, request.options.[conditionsHash,ranges.[skip,limit],sort]
  // Output: { dataArray, total, grandTotal }
  async implementQuery (request) {
    this._checkVars()

    request.options.sort = request.options.sort || this.defaultSort || {}
    request.options.ranges = request.options.ranges || { skip: 0, limit: this.defaultLimitOnQueries }

    let args = []
    var whereStr = ' 1=1'

    // Make up default conditions
    ;({ args, whereStr } = this.defaultConditions(request, args, whereStr))

    // Add ranges
    args.push(request.options.ranges.skip)
    args.push(request.options.ranges.limit)

    // Set up sort
    var sortStr = this.makeSortString(request.options.sort)

    // Make up list of fields
    var fields = this._selectFields(`${this.table}.`)

    var result = await this.connection.queryP(`SELECT ${fields} FROM ${this.table} WHERE ${whereStr} ${sortStr} LIMIT ?,?`, args)
    var grandTotal = (await this.connection.queryP(`SELECT COUNT (*) as grandTotal FROM ${this.table} WHERE ${whereStr}`, args))[0].grandTotal

    return { data: result, grandTotal: grandTotal }
  }

  cleanup (record) {
    var r = Object.assign({}, record)
    for (var k in r) {
      if (typeof this.schema.structure[k] === 'undefined') delete r[k]
    }
    return r
  }
}

exports = module.exports = MySqlStoreMixin
