#include "whisper.h"

#include <cstddef>
#include <cstdint>

#include <emscripten/emscripten.h>

namespace {
whisper_context * context = nullptr;

bool valid_segment(int segment) {
    return context != nullptr && segment >= 0 && segment < whisper_full_n_segments(context);
}

bool valid_token(int segment, int token) {
    return valid_segment(segment) && token >= 0 && token < whisper_full_n_tokens(context, segment);
}
} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE int bolt95_init(void * model, std::size_t size) {
    if (context != nullptr) {
        whisper_free(context);
        context = nullptr;
    }

    auto parameters = whisper_context_default_params();
    parameters.use_gpu = false;
    parameters.flash_attn = false;
    context = whisper_init_from_buffer_with_params(model, size, parameters);
    return context == nullptr ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void bolt95_dispose() {
    if (context != nullptr) {
        whisper_free(context);
        context = nullptr;
    }
}

EMSCRIPTEN_KEEPALIVE int bolt95_run(const float * pcm, int sample_count, const char * language) {
    if (context == nullptr || pcm == nullptr || sample_count <= 0) {
        return 2;
    }

    auto parameters = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    parameters.n_threads = 1;
    parameters.language = language;
    parameters.translate = false;
    parameters.no_context = true;
    parameters.single_segment = false;
    parameters.token_timestamps = true;
    parameters.print_progress = false;
    parameters.print_realtime = false;
    parameters.print_timestamps = false;
    parameters.print_special = false;

    return whisper_full(context, parameters, pcm, sample_count);
}

EMSCRIPTEN_KEEPALIVE int bolt95_segment_count() {
    return context == nullptr ? 0 : whisper_full_n_segments(context);
}

EMSCRIPTEN_KEEPALIVE const char * bolt95_segment_text(int segment) {
    return valid_segment(segment) ? whisper_full_get_segment_text(context, segment) : "";
}

EMSCRIPTEN_KEEPALIVE int bolt95_segment_t0(int segment) {
    return valid_segment(segment) ? whisper_full_get_segment_t0(context, segment) : -1;
}

EMSCRIPTEN_KEEPALIVE int bolt95_segment_t1(int segment) {
    return valid_segment(segment) ? whisper_full_get_segment_t1(context, segment) : -1;
}

EMSCRIPTEN_KEEPALIVE int bolt95_token_count(int segment) {
    return valid_segment(segment) ? whisper_full_n_tokens(context, segment) : 0;
}

EMSCRIPTEN_KEEPALIVE const char * bolt95_token_text(int segment, int token) {
    return valid_token(segment, token) ? whisper_full_get_token_text(context, segment, token) : "";
}

EMSCRIPTEN_KEEPALIVE int bolt95_token_t0(int segment, int token) {
    return valid_token(segment, token)
        ? whisper_full_get_token_data(context, segment, token).t0
        : -1;
}

EMSCRIPTEN_KEEPALIVE int bolt95_token_t1(int segment, int token) {
    return valid_token(segment, token)
        ? whisper_full_get_token_data(context, segment, token).t1
        : -1;
}

EMSCRIPTEN_KEEPALIVE float bolt95_token_probability(int segment, int token) {
    return valid_token(segment, token) ? whisper_full_get_token_p(context, segment, token) : 0.0F;
}

EMSCRIPTEN_KEEPALIVE int bolt95_language_id() {
    return context == nullptr ? -1 : whisper_full_lang_id(context);
}

} // extern "C"
