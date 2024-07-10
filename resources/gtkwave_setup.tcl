set marker_time -1


proc tell_info { } {
    global marker_time

    set newtime [ gtkwave::getMarker ]
    if {$marker_time != $newtime } {
        set marker_time $newtime
        puts "I show trace : "
        foreach name [gtkwave::getDisplayedSignals] {
            set value [gtkwave::getTraceValueAtMarkerFromName $name]
            set flag [gtkwave::getTraceFlagsFromName $name]
            set selected "        "
            if {$flag%2 == 1} {set selected "selected"}
            puts   "$name $selected --- $value" 
        }
    }
}

set last_selected ""

proc tell_selected { } {
    global last_selected

    foreach name [gtkwave::getDisplayedSignals] {
        if {$name eq $last_selected} {continue}
        set value [gtkwave::getTraceValueAtMarkerFromName $name]
        set flag [gtkwave::getTraceFlagsFromName $name]

        if {$flag%2 == 1} {
            puts "Selected $name have value $value"
            set last_selected $name
            break
        }
    }
}


proc demo {varname args} {
    upvar 0 $varname var
    set signal [ string trim $var ".{}" ]
    set val [ gtkwave::getTraceValueAtMarkerFromName $signal ]
    puts "Selected $varname, value is $signal = $val!"

}

trace add variable gtkwave::cbTreeSigSelect  write "demo gtkwave::cbTreeSigSelect" 
puts "Callback should be in place !"
            

puts "Custom init OK !"

