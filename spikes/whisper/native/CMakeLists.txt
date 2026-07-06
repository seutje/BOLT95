cmake_minimum_required(VERSION 3.20)
project(bolt95_whisper_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "This proof must be built with Emscripten")
endif()

if(NOT DEFINED WHISPER_SOURCE_DIR)
  message(FATAL_ERROR "WHISPER_SOURCE_DIR must point to the pinned whisper.cpp source")
endif()

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)

add_compile_options(-O3 -msimd128)
add_subdirectory("${WHISPER_SOURCE_DIR}" whisper EXCLUDE_FROM_ALL)

add_executable(bolt95-whisper adapter.cpp)
target_link_libraries(bolt95-whisper PRIVATE whisper)
target_compile_features(bolt95-whisper PRIVATE cxx_std_17)
target_link_options(bolt95-whisper PRIVATE
  -O3
  -msimd128
  "-sALLOW_MEMORY_GROWTH=1"
  "-sINITIAL_MEMORY=134217728"
  "-sMAXIMUM_MEMORY=2147483648"
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sENVIRONMENT=worker"
  "-sFILESYSTEM=0"
  "-sASSERTIONS=1"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_bolt95_init','_bolt95_dispose','_bolt95_run','_bolt95_segment_count','_bolt95_segment_text','_bolt95_segment_t0','_bolt95_segment_t1','_bolt95_token_count','_bolt95_token_text','_bolt95_token_t0','_bolt95_token_t1','_bolt95_token_probability','_bolt95_language_id']"
  "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToNewUTF8','HEAPU8','HEAPF32']"
)

set_target_properties(bolt95-whisper PROPERTIES SUFFIX ".js")
