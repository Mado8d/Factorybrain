cmake_minimum_required(VERSION 3.16)

# Node type: VIBESENSE or ENERGYSENSE (set via -DNODE_TYPE=...)
if(NOT DEFINED NODE_TYPE)
    set(NODE_TYPE "VIBESENSE")
endif()

message(STATUS "Building firmware for: ${NODE_TYPE}")
add_compile_definitions(NODE_TYPE_${NODE_TYPE})

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(factorybrain-firmware)
