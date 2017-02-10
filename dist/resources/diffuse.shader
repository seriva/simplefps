{
  "vertex" : [
      "#version 300 es",

      "precision mediump float;",

      "layout(location=0) in vec3 vertPosition;",
      "layout(location=1) in vec2 vertTexCoord;",
      "layout(location=2) in vec3 vertNormal;",

      "out vec2 fragTexCoord;",
      "out vec3 fragNormal;",

      "uniform mat4 mWorld;",
      "uniform mat4 mView;",
      "uniform mat4 mProj;",

      "void main()",
      "{",
          "fragTexCoord = vertTexCoord;",
          "fragNormal = (mWorld * vec4(vertNormal, 0.0)).xyz;",
          "gl_Position = mProj * mView * mWorld * vec4(vertPosition, 1.0);",
      "}"
  ],
 "fragment" : [
      "#version 300 es",

      "precision mediump float;",

      "struct DirectionalLight",
      "{",
      "  vec3 direction;",
      "  vec3 color;",
      "};",

      "in vec2 fragTexCoord;",
      "in vec3 fragNormal;",

      "out vec4 fragmentColor;",

      "uniform vec3 ambientLightIntensity;",
      "uniform DirectionalLight sun;",
      "uniform sampler2D sampler;",

      "void main()",
      "{",
          "vec3 surfaceNormal = normalize(fragNormal);",
          "vec3 normSunDir = normalize(sun.direction);",
          "vec4 texel = texture(sampler, fragTexCoord);",
          "vec3 lightIntensity = ambientLightIntensity + sun.color * max(dot(fragNormal, normSunDir), 0.0);",
          "fragmentColor = vec4(texel.rgb * lightIntensity, texel.a);",
      "}"
  ]
}
