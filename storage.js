/* Playdate — shared localStorage utility
 *
 * All reads/writes for playdateUser and playdateRequests go through here.
 * Callers never touch localStorage directly; they use PlaydateStorage.* helpers.
 */
var PlaydateStorage = (function () {

    // ── Internal keys ──────────────────────────────────────────────────────
    var USER_KEY     = 'playdateUser';
    var REQUESTS_KEY = 'playdateRequests';

    // ── playdateUser helpers ───────────────────────────────────────────────

    function _normalizeUser(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return {
            name:       typeof raw.name       === 'string' ? raw.name.trim()       : '',
            city:       typeof raw.city       === 'string' ? raw.city.trim()       : '',
            age:        typeof raw.age        === 'string' ? raw.age               : '',
            bio:        typeof raw.bio        === 'string' ? raw.bio.trim()        : '',
            gender:     (raw.gender === 'Male' || raw.gender === 'Female') ? raw.gender : '',
            skillLevel: typeof raw.skillLevel === 'string' ? raw.skillLevel        : '',
            vibe:       typeof raw.vibe       === 'string' ? raw.vibe              : '',
            sports:     Array.isArray(raw.sports)
                            ? raw.sports.filter(function (s) { return typeof s === 'string'; })
                            : [],
            avatar:     (typeof raw.avatar === 'string' && raw.avatar) ? raw.avatar : '🏃',
            usingPhoto: raw.usingPhoto === true,
            photo:      typeof raw.photo === 'string' ? raw.photo : null
        };
    }

    /**
     * Raw existence check — matches the original nav-hide behavior
     * (truthy iff *any* string is stored, without parsing).
     */
    function hasUser() {
        return !!localStorage.getItem(USER_KEY);
    }

    /**
     * Parse and normalize the stored profile.
     * Returns a clean object, or null if nothing is stored or parsing fails.
     */
    function getUser() {
        try {
            return _normalizeUser(JSON.parse(localStorage.getItem(USER_KEY)));
        } catch (e) {
            return null;
        }
    }

    /**
     * Serialize and persist a profile object.
     * Returns true on success, false on any failure (including quota exceeded).
     */
    function setUser(data) {
        try {
            localStorage.setItem(USER_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    // ── playdateRequests helpers ───────────────────────────────────────────

    function _normalizeRequest(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        if (typeof raw.name  !== 'string' || !raw.name.trim())  return null;
        if (typeof raw.sport !== 'string' || !raw.sport.trim()) return null;
        var status = raw.status;
        if (status !== 'accepted' && status !== 'declined') status = 'pending';
        // Preserve both ISO timestamps and legacy date strings (e.g. "Jun 4, 2026")
        var date = typeof raw.date === 'string' ? raw.date : '';
        return {
            name:   raw.name.trim(),
            sport:  raw.sport.trim(),
            date:   date,
            status: status
        };
    }

    /**
     * Parse, normalize, and return the requests array.
     * Malformed entries are silently dropped.
     * Always returns an array (never throws).
     */
    function getRequests() {
        try {
            var parsed = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map(_normalizeRequest)
                .filter(function (r) { return r !== null; });
        } catch (e) {
            return [];
        }
    }

    /**
     * Persist the requests array.
     * Returns true on success, false on failure.
     */
    function setRequests(requests) {
        try {
            localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Append one request to the stored array.
     * Returns true on success, false on failure.
     */
    function addRequest(req) {
        var requests = getRequests();
        requests.push(req);
        return setRequests(requests);
    }

    function clearUser() {
        localStorage.removeItem(USER_KEY);
    }

    // ── Public API ─────────────────────────────────────────────────────────
    return {
        hasUser:     hasUser,
        getUser:     getUser,
        setUser:     setUser,
        clearUser:   clearUser,
        getRequests: getRequests,
        setRequests: setRequests,
        addRequest:  addRequest
    };

})();
