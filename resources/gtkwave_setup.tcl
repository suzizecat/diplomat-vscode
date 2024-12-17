set marker_time -1


# proc tell_info { } {
#     global marker_time

#     set newtime [ gtkwave::getMarker ]
#     if {$marker_time != $newtime } {
#         set marker_time $newtime
#         puts "I show trace : "
#         foreach name [gtkwave::getDisplayedSignals] {
#             set value [gtkwave::getTraceValueAtMarkerFromName $name]
#             set flag [gtkwave::getTraceFlagsFromName $name]
#             set selected "        "
#             if {$flag%2 == 1} {set selected "selected"}
#             puts   "$name $selected --- $value" 
#         }
#     }
# }

proc tell_time_updated { } {
    global marker_time

    set newtime [ gtkwave::getMarker]
    if {$marker_time != $newtime } {
        set marker_time $newtime
        puts $newtime
    }

    # Adds space as you cannot return an empty string for the typescript management.
    puts " §"
}

set last_selected ""

proc tell_selected { } {
    global last_selected

    foreach name [gtkwave::getDisplayedSignals] {
        
        set value [gtkwave::getTraceValueAtMarkerFromName $name]
        set flag [gtkwave::getTraceFlagsFromName $name]

        if {$flag%2 == 1} {
            if {$name ne $last_selected} {
                puts "{\"name\":\"select\",\"args\":\[\"$name\"\]}"
                set last_selected $name
            }
            break
        }
    }
    puts "§"
}

proc get_signals_values { siglist } {
    set result_list "\["
    set started 0 
    
    # Use previous deltacycle, to properly return values on edges.
    set time_lookup [gtkwave::getMarker]
    set time_lookup [incr time_lookup -1]

    foreach name $siglist {
        # puts "Processing $name"
        lassign [gtkwave::signalChangeList $name -start_time $time_lookup -max 1]  dont_care val 
        set flag [gtkwave::getTraceFlagsFromName $name]

        if { "$flag" eq "" } {
            set flag "null"
          
        } 
        
        if {[info exist val]} {
            set value "\"$val\""
        } {
            set value "null"
        }

        if { $started } { 
            append result_list ",{\"sig\":\"$name\",\"val\":$value,\"flag\":$flag}"
        } {
            append result_list "{\"sig\":\"$name\",\"val\":$value,\"flag\":$flag}"
            set started 1
        }

        unset val
    }
    puts "$result_list\]§"
}
# proc demo {varname args} {
#     upvar 0 $varname var
#     set signal [ string trim $var ".{}" ]
#     set val [ gtkwave::getTraceValueAtMarkerFromName $signal ]
#     puts "Selected $varname, value is $signal = $val!"

# }

# trace add variable gtkwave::cbTreeSigSelect  write "demo gtkwave::cbTreeSigSelect" 
# puts "Callback should be in place !"
            

puts "Custom init OK !"

puts "§"