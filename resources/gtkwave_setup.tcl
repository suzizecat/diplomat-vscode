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

proc demo {varname args} {
    upvar 0 $varname var
    set signal [ string trim $var ".{}" ]
    set val [ gtkwave::getTraceValueAtMarkerFromName $signal ]
    puts "Selected $varname, value is $signal = $val!"

}

trace add variable gtkwave::cbTreeSigSelect  write "demo gtkwave::cbTreeSigSelect" 
puts "Callback should be in place !"
            

puts "Custom init OK !"

