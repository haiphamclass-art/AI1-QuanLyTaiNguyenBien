const { District } = require('../models');

class AreaScopeError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'AreaScopeError';
    this.status = status;
  }
}

const isAdmin = (user) => user?.role === 'admin';
const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
const sameId = (left, right) => String(left) === String(right);

const applyAreaScope = (where = {}, user) => {
  if (!user) {
    throw new AreaScopeError('Unauthorized', 401);
  }

  if (isAdmin(user)) {
    return where;
  }

  if (user.district) {
    return { ...where, district: user.district };
  }

  if (user.province) {
    return { ...where, province: user.province };
  }

  throw new AreaScopeError('User is not assigned to a province or district.');
};

const isAreaWithinScope = (area, user) => {
  if (!area || !user) return false;
  if (isAdmin(user)) return true;
  if (user.district) return String(area.district) === String(user.district);
  if (user.province) return String(area.province) === String(user.province);
  return false;
};

const assertAreaWithinScope = (area, user) => {
  if (!isAreaWithinScope(area, user)) {
    throw new AreaScopeError('Forbidden');
  }
};

const resolveAreaWriteLocation = async ({ province, district }, user, currentArea = null, options = {}) => {
  if (!user) {
    throw new AreaScopeError('Unauthorized', 401);
  }

  const { isCreate = false } = options;
  const currentProvince = currentArea?.province || null;
  const currentDistrict = currentArea?.district || null;

  if (isAdmin(user)) {
    return {
      province: province || currentProvince,
      district: district || currentDistrict,
    };
  }

  if (user.district) {
    const scopedDistrict = await District.findOne({ where: { id: user.district } });
    if (!scopedDistrict) {
      throw new AreaScopeError('Assigned district not found.');
    }
    const scopedProvince = user.province || scopedDistrict.province_id;

    if (hasValue(province) && !sameId(province, scopedProvince)) {
      throw new AreaScopeError('Forbidden');
    }

    if (hasValue(district) && !sameId(district, user.district)) {
      throw new AreaScopeError('Forbidden');
    }

    return {
      province: scopedProvince,
      district: user.district,
    };
  }

  if (user.province) {
    if (hasValue(province) && !sameId(province, user.province)) {
      throw new AreaScopeError('Forbidden');
    }

    if (hasValue(district)) {
      const districtObj = await District.findOne({ where: { id: district } });
      if (!districtObj) {
        throw new AreaScopeError('District not found', 400);
      }
      if (!sameId(districtObj.province_id, user.province)) {
        throw new AreaScopeError('Forbidden');
      }
    }

    const effectiveDistrict = isCreate ? null : (district || currentDistrict);

    return {
      province: user.province,
      district: effectiveDistrict,
    };
  }

  throw new AreaScopeError('User is not assigned to a province or district.');
};

module.exports = {
  AreaScopeError,
  applyAreaScope,
  assertAreaWithinScope,
  isAreaWithinScope,
  resolveAreaWriteLocation,
};
