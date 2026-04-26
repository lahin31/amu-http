const mod = require('./dist/index.cjs');

const amu = mod.default || mod.amu;

module.exports = amu;
module.exports.default = amu;
module.exports.amu = mod.amu || amu;
module.exports.Amu = mod.Amu;
module.exports.AmuError = mod.AmuError;
module.exports.AmuValidationError = mod.AmuValidationError;
module.exports.createInstance = mod.createInstance;
