"""Hindi in Roman letters ("Hinglish"), for captions: चूना जो उसको -> choona jo usko.

Not a translation: the same word, spelled the way people type Hindi in chats. The AI does this when it tidies a
clip's captions (brain.fix_caption_words); this is the fallback for when there is no AI, or it missed a word.
Urdu script is left to the AI, because it is written without most vowels and cannot be spelled out by rule."""
import re

_VOWELS = {"अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai",
           "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e"}
_SIGNS = {"ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o",
          "ौ": "au", "ॉ": "o", "ॅ": "e"}
_CONS = {"क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh",
         "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh",
         "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
         "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
         "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "फ़": "f", "ड़": "r", "ढ़": "rh", "य़": "y"}
_NUKTA = {"क": "q", "ख": "kh", "ग": "gh", "ज": "z", "फ": "f", "ड": "r", "ढ": "rh", "य": "y"}
_VIRAMA, _NUKTA_SIGN = "्", "़"
_NASAL = {"ं": "n", "ँ": "n"}
_OTHER = {"ः": "h", "।": ".", "॥": ".", "ॐ": "om", **{chr(0x0966 + i): str(i) for i in range(10)}}
# Common words whose everyday spelling the rules below would not guess.
_WORDS = {"में": "mein", "मैं": "main", "हैं": "hain", "है": "hai", "नहीं": "nahi", "नही": "nahi", "हूँ": "hoon",
          "हूं": "hoon", "क्या": "kya", "क्यों": "kyun", "क्यूँ": "kyun", "यह": "yeh", "वह": "woh", "और": "aur",
          "भी": "bhi", "ही": "hi", "की": "ki", "जी": "ji", "तो": "to", "हाँ": "haan", "हां": "haan", "यहाँ": "yahan",
          "यहां": "yahan", "वहाँ": "wahan", "वहां": "wahan", "कहाँ": "kahan", "कहां": "kahan", "थी": "thi",
          "रही": "rahi", "कभी": "kabhi", "अभी": "abhi", "सभी": "sabhi", "भाई": "bhai", "मुझे": "mujhe",
          "तुम": "tum", "हम": "hum", "आप": "aap", "बहुत": "bahut", "अच्छा": "accha", "ठीक": "theek", "लिए": "liye"}
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
OTHER_SCRIPT = re.compile(r"[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")   # Urdu / Arabic letters


def has_hindi(text: str) -> bool:
    return bool(DEVANAGARI.search(text or ""))


def needs_roman(text: str) -> bool:
    """Is this Hindi or Urdu script, which captions should show in Roman letters?"""
    return bool(DEVANAGARI.search(text or "") or OTHER_SCRIPT.search(text or ""))


def _word(w: str) -> str:
    if w in _WORDS:
        return _WORDS[w]
    # One unit per letter: [roman consonant or vowel, its vowel or None (None = a consonant with no vowel), is_cons]
    units, i = [], 0
    while i < len(w):
        ch = w[i]
        nxt = w[i + 1] if i + 1 < len(w) else ""
        if ch in _CONS:
            c = _CONS[ch]
            if nxt == _NUKTA_SIGN:
                c = _NUKTA.get(ch, c)
                i += 1
                nxt = w[i + 1] if i + 1 < len(w) else ""
            if nxt == _VIRAMA:
                units.append([c, None, True, False])
                i += 2
                continue
            if nxt in _SIGNS:
                units.append([c, _SIGNS[nxt], True, False])
                i += 2
                continue
            units.append([c, "a", True, True])        # the vowel every Hindi letter carries unless told otherwise
        elif ch in _VOWELS:
            units.append(["", _VOWELS[ch], False, False])
        elif ch in _NASAL:
            if units:
                units[-1][1] = (units[-1][1] or "") + "n"
                units[-1][3] = False
                units[-1].append("nasal")
            else:
                units.append(["n", None, True, False])
        elif ch in _OTHER:
            units.append([_OTHER[ch], None, False, False])
        elif ch == _NUKTA_SIGN or ch == _VIRAMA:
            pass
        else:
            units.append([ch, None, False, False])
        i += 1
    letters = [u for u in units if u[2] or u[1]]
    # Hindi drops the carried "a" at the end of a word, and between a vowel and another vowel-carrying letter
    # (कहना -> kahna, not kahana). Looked at right to left, as speakers do.
    if len(letters) > 1 and letters[-1][3]:
        letters[-1][1] = None
    for k in range(len(letters) - 2, 0, -1):
        u, before, after = letters[k], letters[k - 1], letters[k + 1]
        if u[3] and before[1] and after[2] and after[1] and "nasal" not in before:
            u[1] = None
    # Long vowels the way people type them: doubled only before a consonant that ends a syllable (baat, kaam,
    # aaj), single elsewhere (hamara, pata, ki, tu).
    short = {"aa": "a", "ee": "i", "oo": "u"}
    for k, u in enumerate(letters):
        if u[1] in short:
            after = letters[k + 1] if k + 1 < len(letters) else None
            if after is None or after[1]:
                u[1] = short[u[1]]
    return "".join(u[0] + (u[1] or "") for u in units)


def to_roman(text: str) -> str:
    """Every Hindi word in the text spelled in Roman letters. Anything else is left exactly as it is."""
    if not has_hindi(text):
        return text or ""
    return re.sub(r"[ऀ-ॿ]+", lambda m: _word(m.group(0)), text)


def words(ws: list) -> list:
    """Caption words ({'w', 's', 'e'}) with any Hindi in Roman letters. Timings are untouched."""
    return [dict(w, w=to_roman(w["w"])) if has_hindi(w.get("w", "")) else w for w in ws]
