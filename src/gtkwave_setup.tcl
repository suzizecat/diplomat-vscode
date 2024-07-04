set marker_time -1

proc tell_info { } {
    global marker_time

    set newtime [ gtkwave::getMarker ]
    if {$marker_time != $newtime } {
        set marker_time $newtime
        puts "I show trace : "
        foreach name [gtkwave::getDisplayedSignals] {
            set value [gtkwave::getTraceValueAtMarkerFromName $name]
            puts   "$name = $value" 
        }
    }
}

puts "Custom init OK !"

