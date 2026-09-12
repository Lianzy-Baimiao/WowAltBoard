/*
 * Cross-platform helpers for mutation-test text anchors.
 * Git checks JavaScript in as CRLF on Windows and LF elsewhere, while multiline
 * JavaScript string literals always contain LF. Match against normalized text,
 * then restore the target file's original newline style before writing.
 */
'use strict';

function normalize(s) {
  return String(s).replace(/\r\n?/g, '\n');
}

function newlineOf(s) {
  return String(s).indexOf('\r\n') >= 0 ? '\r\n' : '\n';
}

function count(source, anchor) {
  var src = normalize(source), from = normalize(anchor);
  return from ? src.split(from).length - 1 : 0;
}

function replace(source, from, to) {
  var eol = newlineOf(source);
  var out = normalize(source).replace(normalize(from), normalize(to));
  return eol === '\n' ? out : out.replace(/\n/g, eol);
}

module.exports = { normalize: normalize, count: count, replace: replace };
