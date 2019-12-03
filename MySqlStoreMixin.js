/*
Copyright (C) 2016 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
const promisify = require('util').promisify

const MySqlStoreMixin = (superclass) => class extends superclass {
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
    const l = []

    // Always return isProperty
    l.push(`${prefix}${this.idProperty}`)

    // Return all fields from the schema that are not marked as "silent"
    for (const k in this.schema.structure) {
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

  _positionFiltersFieldsSame (request) {
    // If there is no original request.doc, there is nothing to check
    if (!request.doc) return true

    // Check whether the positionFilter fields have changed.
    // Note that it's a soft `!=` comparison since the way data is stored on the DB
    // might be different to what is passed. This assumes that DB and JS will have
    // compatible results
    for (const k of this.positionFilter) {
      if (typeof request.body[k] !== 'undefined' && typeof request.doc[k] !== 'undefined') {
        if (request.body[k] != request.doc[k]) return false // eslint-disable-line
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
    const last = async () => {
      request.body[this.positionField] = (await this.connection.queryP(`SELECT max(${this.positionField}) as maxPosition FROM ${this.table} WHERE ${wherePositionFilter}`, positionQueryArgs))[0].maxPosition + 1
    }

    // Work really hard to find out what the previous position was
    // Note: request.doc might be empty even in case of update in case
    // of usage via API (implementUpdate() with dummy/incomplete request)
    let prevPosition
    if (request.doc) prevPosition = request.doc[this.positionField]
    else {
      if (request.params && typeof request.params[this.idProperty] !== 'undefined') {
        const r = (await this.connection.queryP(`SELECT ${this.positionField} FROM ${this.table} WHERE ${this.table}.${this.idProperty} = ?`, [request.params[this.idProperty]]))[0]
        if (r) prevPosition = r[this.positionField]
      }
    }

    const positionQueryArgs = []
    let wherePositionFilter
    if (this.positionFilter.length === 0) wherePositionFilter = '1 = 1'
    else {
      const source = request.doc || request.body
      const r = []
      for (const k of this.positionFilter) {
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
    if (!this._positionFiltersFieldsSame(request)) {
      await last()
    }

    // undefined    => leave it where it was (if it had a position) or place it last (if it didn't have a position)
    else if (typeof request.beforeId === 'undefined') {
      if (!prevPosition) await last()
      else request.body[this.positionField] = prevPosition

    // null         => place it last
    } else if (request.beforeId === null) {
      await last()

    // number       => valid record   => place it before that record, overwriting previous position
    //                 Invalid record => place it last
    } else {
      const beforeIdItem = (await this.connection.queryP(`SELECT ${this.table}.${this.idProperty}, ${this.positionField} FROM ${this.table} WHERE ${this.table}.${this.idProperty} = ? AND ${wherePositionFilter}`, [request.beforeId, ...positionQueryArgs]))[0]

      // number       => valid record   => place it before that record, "making space"
      if (beforeIdItem) {
        await this.connection.queryP(`UPDATE ${this.table} SET ${this.positionField} = ${this.positionField} + 1 WHERE ${this.positionField} >= ?  AND ${wherePositionFilter} ORDER BY ${this.positionField} DESC`, [beforeIdItem[this.positionField] || 0, ...positionQueryArgs])
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
    const insertResults = await this.connection.queryP(`INSERT INTO ${this.table} SET ?`, request.body)
    const bogusRequest = { session: request.session, params: { [this.idProperty]: insertResults.insertId } }
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

    await this.connection.queryP(`UPDATE ${this.table} SET ? WHERE ${this.idProperty} = ?`, [request.body, request.params[this.idProperty]])

    const bogusRequest = { session: request.session, params: { [this.idProperty]: request.params.id } }
    return this.implementFetch(bogusRequest)
  }

  // Input: request.params
  // Output: an object (deleted record)
  async implementDelete (request) {
    this._checkVars()

    const fields = this._selectFields(`${this.table}.`)

    const record = (await this.connection.queryP(`SELECT ${fields} FROM ${this.table} WHERE ${this.idProperty} = ?`, request.params[this.idProperty]))[0]
    await this.connection.queryP(`DELETE FROM ${this.table} WHERE ${this.idProperty} = ?`, [request.params[this.idProperty]])
    return record
  }

  async _optionsConditionsAndArgs (request) {
    const conditions = []
    const args = []

    const ch = request.options.conditionsHash

    for (const k in ch) {
      const kEsc = `\`${k}\``
      // Add fields that are in the searchSchema
      if (this.searchSchema.structure[k] && this.schema.structure[k] && String(ch[k]) !== '') {
        if (ch[k] === null) {
          conditions.push(`${this.table}.${kEsc} IS NULL`)
        } else {
          conditions.push(`${this.table}.${kEsc} = ?`)
          args.push(ch[k])
        }
      }
    }

    for (const k in request.params) {
      const kEsc = `\`${k}\``
      if (this.schema.structure[k] && String(request.params[k]) !== '') {
        conditions.push(`${this.table}.${kEsc} = ?`)
        args.push(request.params[k])
      }
    }
    return { conditions, args }
  }

  _optionsSort (request) {
    const optionsSort = request.options.sort
    const sort = []
    if (Object.keys(optionsSort).length) {
      for (const k in optionsSort) {
        sort.push(`${this.table}.${k} ${Number(optionsSort[k]) === 1 ? 'DESC' : 'ASC'}`)
      }
    }
    return sort
  }

  async queryMaker (op, param, request) {
    switch (op) {
      //
      // GET
      case 'fetch':
        switch (param) {
          case 'fieldsAndJoins':
            return {
              fields: [`${this.table}.*`],
              joins: []
            }
          case 'conditionsAndArgs':
            return {
              conditions: [],
              args: []
            }
        }
        break

      // QUERY
      case 'query':
        switch (param) {
          case 'fieldsAndJoins':
            return {
              fields: [`${this.table}.*`],
              joins: []
            }
          case 'conditionsAndArgs':
            return this._optionsConditionsAndArgs(request)
        }
        break

      // UPDATE
      case 'update':
        return

      // INSERT
      case 'insert':
        return

      // DELETE
      case 'delete':
        return

      // DELETE
      case 'sort':
        return this._optionsSort(request)
    }
  }

  buildQuery (fields, joins, conditions, sort) {
    const selectString = `SELECT ${fields.join(',')} FROM ${this.table}`
    const joinString = joins.join(' ')
    const whereString = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const sortString = sort.length
      ? `ORDER BY ${sort.join(',')}`
      : ''

    const rangeString = 'LIMIT ?, ?'

    return {
      fullQuery: `${selectString} ${joinString} ${whereString} ${sortString} ${rangeString}`,
      countQuery: `SELECT count(*) AS grandTotal  FROM ${this.table} ${joinString} ${whereString} ${sortString}`
    }
  }

  // Input: request.params, request.options.[conditionsHash,ranges.[skip,limit],sort]
  // Output: { dataArray, total, grandTotal }
  async implementQuery (request) {
    this._checkVars()

    // Get different select and different args if available
    const { fields, joins } = await this.queryMaker('query', 'fieldsAndJoins', request)
    const { conditions, args } = await this.queryMaker('query', 'conditionsAndArgs', request)
    const sort = await this.queryMaker('sort', null, request)

    const { fullQuery, countQuery } = await this.buildQuery(fields, joins, conditions, sort)

    // Add skip and limit to args
    const argsWithLimits = [...args, request.options.ranges.skip, request.options.ranges.limit]

    const result = await this.connection.queryP(fullQuery, argsWithLimits)
    const grandTotal = (await this.connection.queryP(countQuery, args))[0].grandTotal

    return { data: result, grandTotal: grandTotal }
  }

  buildFetch (fields, joins, conditions) {
    const selectString = `SELECT ${fields.join(',')} FROM ${this.table}`
    const joinString = joins.join(' ')

    // Force the ID asa condition
    conditions = conditions.concat()

    const whereString = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    return `${selectString} ${joinString} ${whereString} `
  }

  // Input: request.params (with key this.idProperty set)
  // Output: an object
  async implementFetch (request) {
    this._checkVars()

    const id = request.params[this.idProperty]
    if (!id) throw new Error('request.params needs to contain idProperty for implementFetch')

    // Get different select and different args if available
    const { fields, joins } = await this.queryMaker('fetch', 'fieldsAndJoins', request)
    const { conditions, args } = await this.queryMaker('fetch', 'conditionsAndArgs', request)

    // MANDATORY: idproperty condition and argument
    conditions.push(`${this.table}.${this.idProperty} = ?`)
    args.push(id)

    const query = await this.buildFetch(fields, joins, conditions)

    // Get the result
    const result = await this.connection.queryP(query, args)

    // Return the first result
    return result[0]
  }

  cleanup (record) {
    const r = Object.assign({}, record)
    for (const k in r) {
      if (typeof this.schema.structure[k] === 'undefined') delete r[k]
    }
    return r
  }
}

exports = module.exports = MySqlStoreMixin
