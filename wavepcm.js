 var WavePCM = function( config ){

  this.inputSampleRate = config.inputSampleRate;
  this.bufferLength = config.bufferLength;
  this.bitDepth = config.bitDepth;
  this.numberOfChannels = config.numberOfChannels;
  this.outputSampleRate = config.outputSampleRate;

  this.recordedBuffers = [];
  this.bytesPerSample = this.bitDepth / 8;
  this.resampledBufferLength = Math.round( this.bufferLength * this.outputSampleRate / this.inputSampleRate );
  this.resampleRatioRemainder  = 1 - ( this.bufferLength * this.outputSampleRate / this.inputSampleRate ) % 1;
  this.resampleRatio = (this.bufferLength-1) / (this.resampledBufferLength-1);

  this.lastSample = [];
  for ( var i = 0; i < this.numberOfChannels; i++ ){
    this.lastSample[i] = 0;
  }

  if ( this.numberOfChannels === 1 && this.outputSampleRate === this.inputSampleRate ) {
    this.resampleAndInterleave = function( buffers ) { return buffers[0]; };
  }
};

WavePCM.prototype.bitReduce = function( floatData ){
  var outputData = new Uint8Array( floatData.length * this.bytesPerSample );
  var outputIndex = 0;

  for ( var i = 0; i < floatData.length; i++ ) {

    var sample = floatData[i];
    if ( sample > 1 ) sample = 1;
    else if ( sample < -1 ) sample = -1;

    switch ( this.bytesPerSample ) {
      case 4:
        sample = sample * 2147483648;
        outputData[ outputIndex++ ] = sample;
        outputData[ outputIndex++ ] = sample >> 8;
        outputData[ outputIndex++ ] = sample >> 16;
        outputData[ outputIndex++ ] = sample >> 24;
        break;

      case 3:
        sample = sample * 8388608;
        outputData[ outputIndex++ ] = sample;
        outputData[ outputIndex++ ] = sample >> 8;
        outputData[ outputIndex++ ] = sample >> 16;
        break;

      case 2:
        sample = sample * 32768;
        outputData[ outputIndex++ ] = sample;
        outputData[ outputIndex++ ] = sample >> 8;
        break;

      case 1:
        outputData[ outputIndex++ ] = (sample+1) * 128;
        break;

      default:
        throw "Only 8, 16, 24 and 32 bits per sample are supported";
    }
  }

  return outputData;
};

WavePCM.prototype.get = function( format ){
  switch( format ){
    case "wav":
      return this.getFile( this.mergeBuffers( this.recordedBuffers ) );

    default:
      throw "Unsupported format: " + format;
  }
};

WavePCM.prototype.getFile = function( audioData ){
  var header = this.getHeader( audioData.byteLength );
  var wav = new Uint8Array( header.byteLength + audioData.byteLength );

  wav.set( header );
  wav.set( audioData, header.byteLength );

  return wav;
};

WavePCM.prototype.getHeader = function( dataLength ) {
  var header = new ArrayBuffer( 44 );
  var view = new DataView( header );

  view.setUint32( 0, 1380533830, false ); // RIFF identifier 'RIFF'
  view.setUint32( 4, 36 + dataLength, true ); // file length minus RIFF identifier length and file description length
  view.setUint32( 8, 1463899717, false ); // RIFF type 'WAVE'
  view.setUint32( 12, 1718449184, false ); // format chunk identifier 'fmt '
  view.setUint32( 16, 16, true ); // format chunk length 
  view.setUint16( 20, 1, true ); // sample format (raw)
  view.setUint16( 22, this.numberOfChannels, true ); // channel count
  view.setUint32( 24, this.outputSampleRate, true ); // sample rate
  view.setUint32( 28, this.outputSampleRate * this.bytesPerSample * this.numberOfChannels, true ); // byte rate (sample rate * block align)
  view.setUint16( 32, this.bytesPerSample * this.numberOfChannels, true ); // block align (channel count * bytes per sample)
  view.setUint16( 34, this.bitDepth, true ); // bits per sample
  view.setUint32( 36, 1684108385, false); // data chunk identifier 'data'
  view.setUint32( 40, dataLength, true ); // data chunk length

  return new Uint8Array( header );
};

WavePCM.prototype.mergeBuffers = function( buffers ) {
  var bytesPerChunk = this.resampledBufferLength * this.numberOfChannels * this.bytesPerSample;
  var mergedBuffers = new Uint8Array( buffers.length * bytesPerChunk );

  for (var i = 0; i < buffers.length; i++ ) {
    mergedBuffers.set( buffers[i], i*bytesPerChunk );
  }

  return mergedBuffers;
};

WavePCM.prototype.recordBuffers = function( buffers ){
  this.recordedBuffers.push( this.bitReduce( this.resampleAndInterleave( buffers ) ) );
};

WavePCM.prototype.resampleAndInterleave = function( buffers ) {
  var outputData = new Float32Array( this.resampledBufferLength * this.numberOfChannels );

  for ( var channel = 0; channel < this.numberOfChannels; channel++ ) {
    var channelData = buffers[ channel ];
    outputData[ channel ] = this.lastSample[ channel ] + ( channelData[ 0 ] - this.lastSample[ channel ] ) * this.resampleRatioRemainder;
    this.lastSample[ channel ] = channelData[ this.bufferLength - 1 ];
  }

  for (var i = 1; i < this.resampledBufferLength; i++ ) {
    var ir = i*this.resampleRatio;
    var op = Math.ceil(ir);
    for ( var channel = 0; channel < this.numberOfChannels; channel++ ) {
      var channelData = buffers[ channel ];
      outputData[i*this.numberOfChannels+channel] = channelData[op] + (channelData[op]-channelData[op-1]) * (op-ir);
    }
  }

  return outputData;
};