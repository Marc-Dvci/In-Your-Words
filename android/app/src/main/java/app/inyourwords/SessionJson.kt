package app.inyourwords

import app.inyourwords.core.Session
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/** The session in the same JSON shape as the web build, so a handover opens on either platform. */
fun sessionJson(s: Session): String = buildJsonObject {
    put("v", 1)
    put("startedAt", s.startedAt)
    put("mode", s.mode.wire)
    putJsonArray("phases") {
        s.phases.forEach { p ->
            addJsonObject {
                put("id", p.id.wire)
                putJsonArray("turns") {
                    p.turns.forEach { t ->
                        addJsonObject {
                            putJsonObject("prompt") {
                                put("text", t.prompt.text)
                                put("kind", t.prompt.kind.wire)
                                put("source", t.prompt.source.wire)
                                putJsonArray("links") {
                                    t.prompt.links.forEach { l ->
                                        addJsonObject {
                                            putJsonObject("question") {
                                                put("text", l.question.text)
                                                put("start", l.question.start)
                                                put("end", l.question.end)
                                            }
                                            put("segment", l.segment)
                                            put("start", l.start)
                                            put("end", l.end)
                                        }
                                    }
                                }
                                putJsonArray("rejected") {
                                    t.prompt.rejected.forEach { r ->
                                        addJsonObject {
                                            put("question", r.question)
                                            putJsonArray("reasons") { r.reasons.forEach { add(it.wire) } }
                                            putJsonArray("foreign") { r.foreign.forEach { add(it) } }
                                        }
                                    }
                                }
                            }
                            put("answer", t.answer)
                        }
                    }
                }
            }
        }
    }
}.toString()

