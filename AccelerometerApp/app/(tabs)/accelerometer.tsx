import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Accelerometer } from "expo-sensors";
import { LineChart } from "react-native-chart-kit";
// @ts-ignore
import * as fftjs from "fft-js";

interface AccelerometerData {
  x: number;
  y: number;
  z: number;
  timestamp?: number;
}

export default function AccelerometerScreen() {
  const [data, setData] = useState<AccelerometerData>({ x: 0, y: 0, z: 0 });
  const [subscription, setSubscription] = useState<
    ReturnType<typeof Accelerometer.addListener> | null
  >(null);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [updateInterval, setUpdateInterval] = useState<number>(100); // Start with 100ms as default
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedData, setRecordedData] = useState<AccelerometerData[]>([]);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [fftResults, setFftResults] = useState<{
    x: { frequencies: number[]; magnitudes: number[] };
    y: { frequencies: number[]; magnitudes: number[] };
    z: { frequencies: number[]; magnitudes: number[] };
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>("Initializing...");
  
  const recordingRef = useRef<NodeJS.Timeout | null>(null);
  const dataCollectionRef = useRef<AccelerometerData[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Check if accelerometer is available
  useEffect(() => {
    checkAvailability();
    
    // Start listening to accelerometer immediately to verify it works
    _subscribe();
    
    return () => _unsubscribe();
  }, []);

  const checkAvailability = async () => {
    try {
      const available = await Accelerometer.isAvailableAsync();
      setIsAvailable(available);
      setDebugInfo(prev => prev + `\nAccelerometer available: ${available}`);
      
      if (!available) {
        console.log("Accelerometer not available on this device");
        Alert.alert(
          "Hardware Not Available",
          "Accelerometer is not available on this device."
        );
      }
    } catch (error) {
      console.error("Error checking accelerometer availability:", error);
      setDebugInfo(prev => prev + `\nError checking availability: ${error}`);
    }
  };

  const _subscribe = () => {
    try {
      // Unsubscribe first if already subscribed
      _unsubscribe();
      
      // Set update interval
      Accelerometer.setUpdateInterval(updateInterval);
      setDebugInfo(prev => prev + `\nSet update interval to ${updateInterval}ms`);

      // Subscribe to accelerometer updates
      const newSubscription = Accelerometer.addListener((accelerometerData) => {
        const now = Date.now();
        const timestampedData = {
          ...accelerometerData,
          timestamp: now,
        };
        
        // Update the last update time
        const timeSinceLastUpdate = now - lastUpdateRef.current;
        lastUpdateRef.current = now;
        
        // Only update UI occasionally to avoid performance issues
        setData(timestampedData);
        
        // If recording, add data to collection
        if (isRecording) {
          dataCollectionRef.current.push(timestampedData);
          
          // Update debug info occasionally
          if (dataCollectionRef.current.length % 10 === 0) {
            setDebugInfo(`Recording: ${dataCollectionRef.current.length} samples\nLast interval: ${timeSinceLastUpdate}ms`);
          }
        }
      });
      
      setSubscription(newSubscription);
      setDebugInfo(prev => prev + "\nSubscribed to accelerometer");
      
      console.log("Successfully subscribed to accelerometer");
    } catch (error) {
      console.error("Error subscribing to accelerometer:", error);
      setDebugInfo(prev => prev + `\nError subscribing: ${error}`);
      Alert.alert(
        "Sensor Error",
        "Failed to access the accelerometer. Please restart the app."
      );
    }
  };

  const _unsubscribe = () => {
    try {
      if (subscription) {
        subscription.remove();
        setSubscription(null);
        setDebugInfo(prev => prev + "\nUnsubscribed from accelerometer");
        console.log("Unsubscribed from accelerometer");
      }
    } catch (error) {
      console.error("Error unsubscribing from accelerometer:", error);
      setDebugInfo(prev => prev + `\nError unsubscribing: ${error}`);
    }
  };

  useEffect(() => {
    return () => {
      _unsubscribe();
      if (recordingRef.current) {
        clearTimeout(recordingRef.current);
      }
    };
  }, []);

  const startRecording = () => {
    // Reset data collection
    dataCollectionRef.current = [];
    setRecordedData([]);
    setFftResults(null);
    
    // First unsubscribe if already subscribed
    if (subscription) {
      subscription.remove();
      setSubscription(null);
    }
    
    // Set a small delay before subscribing again
    setTimeout(() => {
      // Set update interval
      Accelerometer.setUpdateInterval(updateInterval);
      
      // Create a new subscription specifically for recording
      const newSubscription = Accelerometer.addListener((accelerometerData) => {
        const timestampedData = {
          ...accelerometerData,
          timestamp: Date.now(),
        };
        
        // Update UI data
        setData(timestampedData);
        
        // Add to collection - this is the critical part
        dataCollectionRef.current.push(timestampedData);
        
        console.log(`Data point collected: ${dataCollectionRef.current.length}`);
      });
      
      setSubscription(newSubscription);
      setIsRecording(true);
      startTimeRef.current = Date.now();
      
      // Set a timer to stop recording after 10 seconds
      recordingRef.current = setTimeout(() => {
        stopRecording();
      }, 10000);
      
      console.log("Started recording with fresh subscription");
    }, 100);
  };
  

  const stopRecording = () => {
    setIsRecording(false);
    
    if (recordingRef.current) {
      clearTimeout(recordingRef.current);
      recordingRef.current = null;
    }
    
    // Log the data collection size before processing
    console.log(`Collection size before processing: ${dataCollectionRef.current.length}`);
    
    // Make a copy of the collected data
    const collectedData = [...dataCollectionRef.current];
    console.log(`Collected ${collectedData.length} data points`);
    
    // Process only if we have data
    if (collectedData.length > 0) {
      setRecordedData(collectedData);
      processData(collectedData);
    } else {
      console.log("No data was collected during recording");
      Alert.alert(
        "No Data Collected",
        "The accelerometer didn't provide any data. Try the following:\n\n" +
        "1. Restart the app\n" +
        "2. Make sure your device supports accelerometer\n" +
        "3. Try a different device"
      );
    }
    
    // Don't unsubscribe here, keep listening for UI updates
  };
  

// Add this useEffect to your component
// Update your recording timer useEffect to this:
useEffect(() => {
  let interval: NodeJS.Timeout | null = null;
  
  if (isRecording && startTimeRef.current) {
    // Make sure we update the UI more frequently
    interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current!) / 1000;
      setRecordingTime(Math.min(elapsed, 10));
      
      // Log the current count for debugging
      console.log(`Recording time: ${elapsed.toFixed(1)}s, Points: ${dataCollectionRef.current.length}`);
      
      if (elapsed >= 10) {
        clearInterval(interval!);
        // Ensure we stop recording when timer reaches 10s
        if (isRecording) {
          stopRecording();
        }
      }
    }, 100); // Update every 100ms for smoother UI
  } else {
    setRecordingTime(0);
  }
  
  return () => {
    if (interval) clearInterval(interval);
  };
}, [isRecording]);



const processData = (data: AccelerometerData[]) => {
  setIsProcessing(true);
  
  try {
    // Ensure we have enough data points
    if (data.length < 4) {
      console.log("Not enough data points for FFT");
      setDebugInfo("Not enough data points for FFT");
      setIsProcessing(false);
      return;
    }

    // Calculate sampling rate (samples per second)
    const firstTimestamp = data[0].timestamp || 0;
    const lastTimestamp = data[data.length - 1].timestamp || 0;
    const durationSeconds = (lastTimestamp - firstTimestamp) / 1000;
    const samplingRate = data.length / durationSeconds;
    
    console.log(`Collected ${data.length} samples over ${durationSeconds.toFixed(2)} seconds`);
    console.log(`Effective sampling rate: ${samplingRate.toFixed(2)} Hz`);
    setDebugInfo(`Samples: ${data.length}\nDuration: ${durationSeconds.toFixed(2)}s\nRate: ${samplingRate.toFixed(2)} Hz`);

    // Extract x, y, z components
    const xData = data.map((d) => d.x);
    const yData = data.map((d) => d.y);
    const zData = data.map((d) => d.z);

    // Perform FFT on each axis
    const fftX = performFFT(xData);
    const fftY = performFFT(yData);
    const fftZ = performFFT(zData);

    // Calculate frequency bins - use the actual FFT output length
    const frequencyBins = Array.from({ length: fftX.length }, (_, i) => 
      (i * samplingRate) / (fftX.length * 2)
    );

    // Debug FFT results
    console.log("FFT X first 5 magnitudes:", fftX.slice(0, 5));
    console.log("FFT Y first 5 magnitudes:", fftY.slice(0, 5));
    console.log("FFT Z first 5 magnitudes:", fftZ.slice(0, 5));
    console.log("First 5 frequency bins:", frequencyBins.slice(0, 5));

    // Check if all values are zero or very small
    const maxX = Math.max(...fftX);
    const maxY = Math.max(...fftY);
    const maxZ = Math.max(...fftZ);
    console.log("Max magnitudes - X:", maxX, "Y:", maxY, "Z:", maxZ);

    setFftResults({
      x: { frequencies: frequencyBins, magnitudes: fftX },
      y: { frequencies: frequencyBins, magnitudes: fftY },
      z: { frequencies: frequencyBins, magnitudes: fftZ },
    });
  } catch (error) {
    console.error("Error processing data:", error);
    setDebugInfo(`Error processing data: ${error}`);
    Alert.alert(
      "Processing Error",
      "An error occurred while processing the accelerometer data."
    );
  } finally {
    setIsProcessing(false);
  }
};



// Define types for the FFT library
interface FFTLibrary {
  fft: (input: number[] | number[][]) => any;
}

const performFFT = (timeData: number[]) => {
  try {
    // Log the input data
    console.log("FFT input data first 5 points:", timeData.slice(0, 5));
    
    // Make sure we have a power of 2 length for the FFT
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(timeData.length)));
    let paddedData = [...timeData];
    
    // Pad with zeros if needed
    while (paddedData.length < nextPow2) {
      paddedData.push(0);
    }
    
    // Apply a window function to reduce spectral leakage
    const windowedData = applyHannWindow(paddedData);
    
    // Get the FFT function from the library
    const fftLibrary = fftjs as unknown as FFTLibrary;
    
    // Try different input formats based on the library's requirements
    let fftResult;
    try {
      // Try with array of [real, imaginary] pairs
      const phasors = windowedData.map(val => [val, 0]);
      fftResult = fftLibrary.fft(phasors);
    } catch (e) {
      // If that fails, try with alternating real/imaginary values
      const alternating: number[] = [];
      for (let i = 0; i < windowedData.length; i++) {
        alternating.push(windowedData[i]); // Real
        alternating.push(0);               // Imaginary
      }
      fftResult = fftLibrary.fft(alternating);
    }
    
    console.log("Raw FFT result type:", typeof fftResult);
    console.log("Raw FFT result first 10 values:", fftResult.slice(0, 10));

    // Calculate magnitude spectrum based on the format of fftResult
    const magnitudes: number[] = [];
    
    if (Array.isArray(fftResult[0])) {
      // If result is array of [real, imaginary] pairs
      for (let i = 0; i < fftResult.length / 2; i++) {
        const real = fftResult[i][0];
        const imag = fftResult[i][1];
        const magnitude = Math.sqrt(real * real + imag * imag);
        magnitudes.push(magnitude / windowedData.length);
      }
    } else {
      // If result is alternating real/imaginary values
      for (let i = 0; i < fftResult.length / 4; i++) {
        const real = fftResult[i * 2];
        const imag = fftResult[i * 2 + 1];
        const magnitude = Math.sqrt(real * real + imag * imag);
        magnitudes.push(magnitude / windowedData.length);
      }
    }
    
    console.log("Calculated magnitudes first 5:", magnitudes.slice(0, 5));
    return magnitudes;
  } catch (error) {
    console.error("FFT calculation error:", error);
    return Array(Math.ceil(timeData.length / 2)).fill(0);
  }
};




// Improved Hann window function
const applyHannWindow = (data: number[]) => {
  return data.map((value, index) => {
    const hannFactor = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (data.length - 1)));
    return value * hannFactor;
  });
};


  const toggleSubscription = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const changeUpdateInterval = (newInterval: number) => {
    setUpdateInterval(newInterval);
    setDebugInfo(prev => prev + `\nChanged interval to ${newInterval}ms`);
    
    if (subscription) {
      _unsubscribe();
      setTimeout(() => {
        _subscribe();
      }, 10);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Vibration Frequency Analyzer</Text>

        {!isAvailable ? (
          <Text style={styles.errorText}>
            Accelerometer is not available on this device
          </Text>
        ) : (
          <>
            <View style={styles.dataContainer}>
              <Text style={styles.dataLabel}>X-axis:</Text>
              <Text style={styles.dataValue}>{data.x.toFixed(4)}</Text>
            </View>

            <View style={styles.dataContainer}>
              <Text style={styles.dataLabel}>Y-axis:</Text>
              <Text style={styles.dataValue}>{data.y.toFixed(4)}</Text>
            </View>

            <View style={styles.dataContainer}>
              <Text style={styles.dataLabel}>Z-axis:</Text>
              <Text style={styles.dataValue}>{data.z.toFixed(4)}</Text>
            </View>

            {/* Debug information */}
            <View style={styles.debugContainer}>
              <Text style={styles.debugTitle}>Debug Info:</Text>
              <Text style={styles.debugText}>{debugInfo}</Text>
            </View>

            {isRecording && (
              <View style={styles.recordingIndicator}>
                <Text style={styles.recordingText}>
                  Recording: {recordingTime.toFixed(1)} / 10.0 seconds
                </Text>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${(recordingTime / 10) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            )}

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                onPress={toggleSubscription}
                style={[
                  styles.button,
                  {
                    backgroundColor: isRecording ? "#F44336" : "#4CAF50",
                  },
                ]}
                disabled={isProcessing}
              >
                <Text style={styles.buttonText}>
                  {isRecording
                    ? "Stop Recording"
                    : isProcessing
                    ? "Processing..."
                    : "Start 10s Recording"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.intervalContainer}>
              <Text style={styles.intervalLabel}>Sampling Rate:</Text>
              <View style={styles.intervalButtons}>
                <TouchableOpacity
                  onPress={() => changeUpdateInterval(100)}
                  style={[
                    styles.intervalButton,
                    updateInterval === 100 && styles.activeIntervalButton,
                  ]}
                  disabled={isRecording}
                >
                  <Text style={styles.intervalButtonText}>100ms</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => changeUpdateInterval(200)}
                  style={[
                    styles.intervalButton,
                    updateInterval === 200 && styles.activeIntervalButton,
                  ]}
                  disabled={isRecording}
                >
                  <Text style={styles.intervalButtonText}>200ms</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => changeUpdateInterval(500)}
                  style={[
                    styles.intervalButton,
                    updateInterval === 500 && styles.activeIntervalButton,
                  ]}
                  disabled={isRecording}
                >
                  <Text style={styles.intervalButtonText}>500ms</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Test button to verify accelerometer is working */}
            <TouchableOpacity
              onPress={() => {
                _unsubscribe();
                setTimeout(() => {
                  _subscribe();
                  setDebugInfo("Restarted accelerometer subscription");
                }, 100);
              }}
              style={styles.testButton}
              disabled={isRecording}
            >
              <Text style={styles.testButtonText}>
                Restart Accelerometer
              </Text>
            </TouchableOpacity>

            {isProcessing && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.processingText}>
                  Processing FFT, please wait...
                </Text>
              </View>
            )}

            {fftResults && (
              <View style={styles.resultsContainer}>
                <Text style={styles.resultsTitle}>
                  Frequency Analysis Results
                </Text>
                <Text style={styles.resultsSubtitle}>
                  Samples: {recordedData.length} | 
                  Duration: {((recordedData[recordedData.length - 1]?.timestamp || 0) - 
                             (recordedData[0]?.timestamp || 0)) / 1000}s
                </Text>

                <Text style={styles.chartTitle}>X-Axis Frequency Spectrum</Text>
                <LineChart
  data={{
    labels: [],
    datasets: [
      {
        data: fftResults.x.magnitudes.slice(1, 32).map(val => val + 0.1), // Add a small offset to ensure visibility
      },
    ],
  }}
  width={Dimensions.get("window").width - 40}
  height={220}
  chartConfig={{
    backgroundColor: "#ffffff",
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: "0",
    },
  }}
  bezier
  style={styles.chart}
/>


                <Text style={styles.chartCaption}>
                  Frequency (Hz): 0 - {fftResults.x.frequencies[99]?.toFixed(1) || "N/A"}
                </Text>

                <Text style={styles.chartTitle}>Y-Axis Frequency Spectrum</Text>
                <LineChart
                  data={{
                    labels: [],
                    datasets: [
                      {
                        data: fftResults.y.magnitudes.slice(1, 100).length > 0 
                          ? fftResults.y.magnitudes.slice(1, 100) 
                          : [0, 0, 0, 0], // Fallback if no data
                      },
                    ],
                  }}
                  width={Dimensions.get("window").width - 40}
                  height={220}
                  chartConfig={{
                    backgroundColor: "#ffffff",
                    backgroundGradientFrom: "#ffffff",
                    backgroundGradientTo: "#ffffff",
                    decimalPlaces: 2,
                    color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    style: {
                      borderRadius: 16,
                    },
                    propsForDots: {
                      r: "0",
                    },
                  }}
                  bezier
                  style={styles.chart}
                />
                <Text style={styles.chartCaption}>
                  Frequency (Hz): 0 - {fftResults.y.frequencies[99]?.toFixed(1) || "N/A"}
                </Text>

                <Text style={styles.chartTitle}>Z-Axis Frequency Spectrum</Text>
                <LineChart
                  data={{
                    labels: [],
                    datasets: [
                      {
                        data: fftResults.z.magnitudes.slice(1, 100).length > 0 
                          ? fftResults.z.magnitudes.slice(1, 100) 
                          : [0, 0, 0, 0], // Fallback if no data
                      },
                    ],
                  }}
                  width={Dimensions.get("window").width - 40}
                  height={220}
                  chartConfig={{
                    backgroundColor: "#ffffff",
                    backgroundGradientFrom: "#ffffff",
                    backgroundGradientTo: "#ffffff",
                    decimalPlaces: 2,
                    color: (opacity = 1) => `rgba(244, 67, 54, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    style: {
                      borderRadius: 16,
                    },
                    propsForDots: {
                      r: "0",
                    },
                  }}
                  bezier
                  style={styles.chart}
                />
                <Text style={styles.chartCaption}>
                  Frequency (Hz): 0 - {fftResults.z.frequencies[99]?.toFixed(1) || "N/A"}
                </Text>

                {/* Display dominant frequencies */}
                <View style={styles.dominantFreqContainer}>
                  <Text style={styles.dominantFreqTitle}>
                    Dominant Frequencies
                  </Text>
                  
                  <View style={styles.dominantFreqRow}>
                    <Text style={styles.dominantFreqLabel}>X-axis:</Text>
                    <Text style={styles.dominantFreqValue}>
                      {getDominantFrequencies(fftResults.x.frequencies, fftResults.x.magnitudes)
                        .map(f => `${f.frequency.toFixed(1)} Hz (${f.magnitude.toFixed(2)})`)
                        .join(", ")}
                    </Text>
                  </View>
                  
                  <View style={styles.dominantFreqRow}>
                    <Text style={styles.dominantFreqLabel}>Y-axis:</Text>
                    <Text style={styles.dominantFreqValue}>
                      {getDominantFrequencies(fftResults.y.frequencies, fftResults.y.magnitudes)
                        .map(f => `${f.frequency.toFixed(1)} Hz (${f.magnitude.toFixed(2)})`)
                        .join(", ")}
                    </Text>
                  </View>
                  
                  <View style={styles.dominantFreqRow}>
                    <Text style={styles.dominantFreqLabel}>Z-axis:</Text>
                    <Text style={styles.dominantFreqValue}>
                      {getDominantFrequencies(fftResults.z.frequencies, fftResults.z.magnitudes)
                        .map(f => `${f.frequency.toFixed(1)} Hz (${f.magnitude.toFixed(2)})`)
                        .join(", ")}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

// Helper function to find dominant frequencies
// Helper function to find dominant frequencies
const getDominantFrequencies = (frequencies: number[], magnitudes: number[], count = 3) => {
  // Skip the DC component (index 0) and filter out invalid values
  const indexedMagnitudes = magnitudes.slice(1)
    .map((mag, i) => ({ 
      index: i + 1, 
      magnitude: isNaN(mag) || !isFinite(mag) ? 0 : mag,
      frequency: isNaN(frequencies[i + 1]) || !isFinite(frequencies[i + 1]) ? 0 : frequencies[i + 1]
    }))
    .filter(item => item.magnitude > 0); // Remove zero magnitude items
  
  // If we have no valid data, return empty array
  if (indexedMagnitudes.length === 0) {
    return Array(count).fill({ frequency: 0, magnitude: 0 });
  }
  
  // Sort by magnitude (descending)
  indexedMagnitudes.sort((a, b) => b.magnitude - a.magnitude);
  
  // Return top frequencies
  return indexedMagnitudes.slice(0, count);
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 30,
    textAlign: "center",
  },
  dataContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  dataLabel: {
    fontSize: 18,
    fontWeight: "500",
  },
  dataValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  debugContainer: {
    backgroundColor: "#f0f0f0",
    padding: 10,
    borderRadius: 5,
    marginVertical: 10,
  },
  debugTitle: {
    fontWeight: "bold",
    marginBottom: 5,
  },
  debugText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buttonContainer: {
    marginTop: 30,
    alignItems: "center",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 200,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  testButton: {
    marginTop: 15,
    backgroundColor: "#9C27B0",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignSelf: "center",
  },
  testButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: {
    color: "red",
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
  },
  intervalContainer: {
    marginTop: 30,
  },
  intervalLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 10,
  },
  intervalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  intervalButton: {
    backgroundColor: "#e0e0e0",
    padding: 10,
    borderRadius: 5,
    flex: 1,
    marginHorizontal: 5,
    alignItems: "center",
  },
  activeIntervalButton: {
    backgroundColor: "#2196F3",
  },
  intervalButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#000",
  },
  recordingIndicator: {
    marginTop: 20,
    alignItems: "center",
  },
  recordingText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#F44336",
    marginBottom: 10,
  },
  progressBar: {
    width: "100%",
    height: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#F44336",
  },
  processingContainer: {
    marginTop: 30,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  processingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#2196F3",
  },
  resultsContainer: {
    marginTop: 30,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
    textAlign: "center",
  },
  resultsSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  chartCaption: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  dominantFreqContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
  },
  dominantFreqTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  dominantFreqRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  dominantFreqLabel: {
    fontSize: 14,
    fontWeight: "500",
    width: 60,
  },
  dominantFreqValue: {
    fontSize: 14,
    flex: 1,
  },
});

