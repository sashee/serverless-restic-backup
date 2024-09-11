termux_step_make_install() {
	mkdir -p "$TERMUX_PREFIX/lib/$TERMUX_PKG_NAME"
	cp -R /home/builder/termux-packages/packages/$TERMUX_PKG_NAME/usr/lib/$TERMUX_PKG_NAME/* "$TERMUX_PREFIX/lib/$TERMUX_PKG_NAME"
	mkdir -p "$TERMUX_PREFIX/bin"

	cat << EOF > $TERMUX_PREFIX/bin/$TERMUX_PKG_NAME
#!\$TERMUX_PREFIX/bin/bash
echo "Running script!"
case "\${1}" in
	"schedule")
		echo "Running schedule!"
		termux-job-scheduler --period-ms 86400000 --script $TERMUX_PREFIX/bin/$TERMUX_PKG_NAME --network unmetered --persisted true

		exit 0;;
	*)
		RUN_IN_SHELL=true $TERMUX_PREFIX/lib/$TERMUX_PKG_NAME/index.js "\$@"
	;;
esac
EOF
	chmod +x $TERMUX_PREFIX/bin/$TERMUX_PKG_NAME
}

termux_step_create_debscripts () {
	cat << EOF > postinst
#!$TERMUX_PREFIX/bin/bash
echo "Running postinst!"
echo $TERMUX_PKG_NAME
mkdir -p $TERMUX_PREFIX/var/$TERMUX_PKG_NAME
echo "postinst called" >> $TERMUX_PREFIX/var/$TERMUX_PKG_NAME/log
EOF
	chmod 0755 postinst
	cat << EOF > prerm
#!$TERMUX_PREFIX/bin/bash
echo "Running prerm!"
echo $TERMUX_PKG_NAME
mkdir -p $TERMUX_PREFIX/var/$TERMUX_PKG_NAME
echo "prerm called" >> $TERMUX_PREFIX/var/$TERMUX_PKG_NAME/log
EOF
	chmod 0755 prerm
}
