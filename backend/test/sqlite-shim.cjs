// Jest's resolver can't classify the experimental `node:sqlite` builtin.
// process.getBuiltinModule loads it directly, bypassing module resolution.
module.exports = process.getBuiltinModule("node:sqlite");
