{
  vertex : [
      'precision mediump float;',

      'attribute vec3 vertPosition;',
      'attribute vec2 vertTexCoord;',
      'attribute vec3 vertNormal;',

      'varying vec2 fragTexCoord;',
      'varying vec3 fragNormal;',

      'uniform mat4 mWorld;',
      'uniform mat4 mView;',
      'uniform mat4 mProj;',

      'void main()',
      '{',
          'fragTexCoord = vertTexCoord;',
          'fragNormal = (mWorld * vec4(vertNormal, 0.0)).xyz;',
          'gl_Position = mProj * mView * mWorld * vec4(vertPosition, 1.0);',
      '}'
  ],
  fragment : [
      'precision mediump float;',

      'struct DirectionalLight',
      '{',
      ' vec3 direction;',
      '	vec3 color;',
      '};',

      'varying vec2 fragTexCoord;',
      'varying vec3 fragNormal;',

      'uniform vec3 ambientLightIntensity;',
      'uniform DirectionalLight sun;',
      'uniform sampler2D sampler;',

      'void main()',
      '{',
          'vec3 surfaceNormal = normalize(fragNormal);',
          'vec3 normSunDir = normalize(sun.direction);',
          'vec4 texel = texture2D(sampler, fragTexCoord);',
          'vec3 lightIntensity = ambientLightIntensity + sun.color * max(dot(fragNormal, normSunDir), 0.0);',
          'gl_FragColor = vec4(texel.rgb * lightIntensity, texel.a);',
      '}'
  ]
}
