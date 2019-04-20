

function ClassOf(_class, _parentClass) {
  while (_class != null) {
    if (_class.constructor == _parentClass.constructor)  return true;
    _class = _class.prototype;
  }
  return false;
}

module.exports = { ClassOf }