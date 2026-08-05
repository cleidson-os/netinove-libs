require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'NetinoveThermalPrinter'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = 'https://bitbucket.org/netinovebr/netinove-libs'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://bitbucket.org/netinovebr/netinove-libs.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
