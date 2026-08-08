# Mosquitto image with DoorCloud config baked in. No relative host binds:
# Coolify's compose parser can't bind repo-relative files into containers, so
# the broker config + ACL + password generator ship inside the image.
FROM eclipse-mosquitto:2

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY aclfile /mosquitto/config/aclfile
COPY password-generator.sh /mosquitto/config/password-generator.sh
RUN chmod +x /mosquitto/config/password-generator.sh