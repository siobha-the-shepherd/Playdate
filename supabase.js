/* Playdate — Supabase client and auth helpers
 *
 * Load order: Supabase CDN → storage.js → supabase.js
 * Exposes: sb, initNavAuth(), getProfileWithFallback(), syncSessionBackground(),
 *          upsertProfile(), signOut(), authErrorMessage()
 */

// Minimal no-op stub used when the CDN fails or createClient() throws.
// All callers already handle null sessions, so safe promises are enough.
var _sbStub = {
    auth: {
        getSession:         function() { return Promise.resolve({ data: { session: null }, error: null }); },
        signUp:             function() { return Promise.resolve({ data: { user: null, session: null }, error: null }); },
        signInWithPassword: function() { return Promise.resolve({ data: {}, error: { message: 'Unable to connect to server.' } }); },
        signOut:            function() { return Promise.resolve({}); }
    },
    from: function() {
        return {
            select: function() {
                return { eq: function() { return { single: function() { return Promise.resolve({ data: null, error: null }); } }; } };
            },
            upsert: function() { return Promise.resolve({ data: null, error: null }); }
        };
    }
};

var sb;
try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        sb = window.supabase.createClient(
            'https://eictxjdisambrmfvgbbx.supabase.co',
            'sb_publishable_iFfgazif6ybJDyG3Z4TX1Q_MTT1l1ZO'
        );
    } else {
        sb = _sbStub;
    }
} catch (e) {
    sb = _sbStub;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function _mapSupabaseProfile(row) {
    if (!row) return null;
    var local = PlaydateStorage.getUser();
    return {
        name:       typeof row.name        === 'string' ? row.name        : '',
        city:       typeof row.city        === 'string' ? row.city        : '',
        age:        row.age  != null       ? String(row.age)              : '',
        bio:        typeof row.bio         === 'string' ? row.bio         : '',
        gender:     (row.gender === 'Male' || row.gender === 'Female') ? row.gender : '',
        skillLevel: typeof row.skill_level === 'string' ? row.skill_level : '',
        vibe:       typeof row.vibe        === 'string' ? row.vibe        : '',
        sports:     Array.isArray(row.sports) ? row.sports.filter(function(s) { return typeof s === 'string'; }) : [],
        avatar:     (typeof row.avatar === 'string' && row.avatar) ? row.avatar : '🏃',
        usingPhoto: !!(local && local.usingPhoto && local.photo),
        photo:      (local && local.usingPhoto && local.photo) ? local.photo : null
    };
}

function _mapToSupabaseRow(userData, userId) {
    return {
        id:          userId,
        name:        typeof userData.name        === 'string' ? userData.name        : '',
        city:        typeof userData.city        === 'string' ? userData.city        : '',
        age:         (userData.age && !isNaN(parseInt(userData.age, 10))) ? parseInt(userData.age, 10) : null,
        bio:         typeof userData.bio         === 'string' ? userData.bio         : '',
        gender:      typeof userData.gender      === 'string' ? userData.gender      : '',
        skill_level: typeof userData.skillLevel  === 'string' ? userData.skillLevel  : '',
        vibe:        typeof userData.vibe        === 'string' ? userData.vibe        : '',
        sports:      Array.isArray(userData.sports) ? userData.sports : [],
        avatar:      typeof userData.avatar === 'string' ? userData.avatar : '🏃'
    };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Hide "Sign Up" nav link if the user is logged in via either localStorage or
 * a live Supabase session. Also kicks off a background profile sync.
 * Call once per page immediately after the nav is in the DOM.
 */
function initNavAuth() {
    // Immediate render: localStorage is synchronous — no flicker on known sessions
    if (PlaydateStorage.hasUser()) {
        var el = document.getElementById('nav-signup');
        if (el) el.style.display = 'none';
    }
    // Async: also hide if Supabase has a session even when localStorage is empty
    sb.auth.getSession().then(function(r) {
        if (r.data && r.data.session) {
            var el = document.getElementById('nav-signup');
            if (el) el.style.display = 'none';
        }
    }).catch(function() {});
    syncSessionBackground();
}

/**
 * Load profile: Supabase first (if session exists), localStorage fallback.
 * Preserves photo from localStorage since it is never uploaded to Supabase.
 * Returns a normalized profile object or null.
 */
async function getProfileWithFallback() {
    try {
        var result = await sb.auth.getSession();
        var session = result.data && result.data.session;
        if (session) {
            var profileResult = await sb.from('Profiles').select('*').eq('id', session.user.id).single();
            if (profileResult.data) {
                var merged = _mapSupabaseProfile(profileResult.data);
                PlaydateStorage.setUser(merged);
                return merged;
            }
        }
    } catch (e) { /* fall through */ }
    return PlaydateStorage.getUser();
}

/**
 * Upsert profile row to Supabase.
 * Does not include photo — photo stays local only.
 * Returns true on success, false on any failure (no session, API error, or exception).
 */
async function upsertProfile(userData) {
    try {
        var result = await sb.auth.getSession();
        var session = result.data && result.data.session;
        if (!session) return false;
        var upsertResult = await sb.from('Profiles').upsert(_mapToSupabaseRow(userData, session.user.id));
        if (upsertResult.error) {
            console.error('[Playdate] upsertProfile failed:', upsertResult.error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('[Playdate] upsertProfile threw:', e);
        return false;
    }
}

/**
 * Non-blocking background sync: pull latest profile from Supabase
 * and update localStorage without blocking page render.
 */
async function syncSessionBackground() {
    try {
        var result = await sb.auth.getSession();
        var session = result.data && result.data.session;
        if (!session) return;
        if (localStorage.getItem('playdatePendingSync')) {
            var pending = PlaydateStorage.getUser();
            if (pending) {
                try {
                    var ok = await upsertProfile(pending);
                    if (ok) localStorage.removeItem('playdatePendingSync');
                } catch (e) {}
            }
        }
        var profileResult = await sb.from('Profiles').select('*').eq('id', session.user.id).single();
        if (!profileResult.data) return;
        var merged = _mapSupabaseProfile(profileResult.data);
        PlaydateStorage.setUser(merged);
    } catch (e) {}
}

/**
 * Sign out: clears Supabase session and localStorage profile.
 */
async function signOut() {
    try { await sb.auth.signOut(); } catch (e) {}
    PlaydateStorage.clearUser();
}

/**
 * Return a friendly message for Supabase auth errors.
 */
function authErrorMessage(error) {
    if (!error) return null;
    var msg = error.message || '';
    if (/already registered|already exists|user already registered/i.test(msg)) {
        return 'An account with this email already exists. Try logging in instead.';
    }
    if (/password should be at least|weak password|at least 6/i.test(msg)) {
        return 'Password must be at least 6 characters.';
    }
    if (/invalid email|valid email/i.test(msg)) {
        return 'Please enter a valid email address.';
    }
    if (/invalid login credentials|invalid credentials/i.test(msg)) {
        return 'Incorrect email or password.';
    }
    if (/email not confirmed/i.test(msg)) {
        return 'Please confirm your email before logging in.';
    }
    return msg || 'Something went wrong. Please try again.';
}
